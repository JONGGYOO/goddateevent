import { v } from "convex/values";
import { adminMutation, adminQuery } from "./lib/auth";
import { gender } from "./schema";
import { MAX_ROWS, allMembers, cleanMember, getOrThrow } from "./lib/data";
import { normalizePhone } from "../lib/phone";
import { normalizePlate } from "../lib/plate";

const memberFields = {
  name: v.string(),
  gender,
  phone: v.optional(v.string()),
  church: v.optional(v.string()),
  cars: v.array(v.string()),
  memo: v.optional(v.string()),
};

export const list = adminQuery({
  args: {},
  handler: async (ctx) => allMembers(ctx),
});

export const get = adminQuery({
  args: { id: v.id("members") },
  handler: async (ctx, { id }) => ctx.db.get("members", id),
});

export const create = adminMutation({
  args: memberFields,
  handler: async (ctx, args) => {
    const clean = await cleanMember(ctx, args);
    return await ctx.db.insert("members", clean);
  },
});

export const update = adminMutation({
  args: { id: v.id("members"), ...memberFields },
  handler: async (ctx, { id, ...rest }) => {
    await getOrThrow(ctx, "members", id);
    const clean = await cleanMember(ctx, rest, id);
    // optional 필드를 비우면 undefined로 지워지도록 replace 사용
    await ctx.db.replace("members", id, clean);
    return id;
  },
});

/** 회원 삭제: 참여·조 편성·출석·차량·로그에서 모두 제거 */
export const remove = adminMutation({
  args: { id: v.id("members") },
  handler: async (ctx, { id }) => {
    await getOrThrow(ctx, "members", id);
    const parts = await ctx.db
      .query("participants")
      .withIndex("by_member", (q) => q.eq("memberId", id))
      .take(MAX_ROWS);
    for (const p of parts) await ctx.db.delete("participants", p._id);

    const groupings = await ctx.db.query("groupings").take(MAX_ROWS);
    for (const g of groupings) {
      if (g.assignments.some((a) => a.memberId === id)) {
        await ctx.db.patch("groupings", g._id, { assignments: g.assignments.filter((a) => a.memberId !== id) });
      }
    }

    const att = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", id))
      .take(MAX_ROWS);
    const sessionIds = new Set(att.map((a) => a.sessionId));
    for (const a of att) await ctx.db.delete("attendance", a._id);

    // 차량 체크·로그는 회원 인덱스가 없어 회원이 출석했던 회차 + 참여 행사 회차를 훑는다
    for (const p of parts) {
      const ss = await ctx.db
        .query("sessions")
        .withIndex("by_event_date", (q) => q.eq("eventId", p.eventId))
        .take(MAX_ROWS);
      for (const s of ss) sessionIds.add(s._id);
    }
    for (const sid of sessionIds) {
      const cars = await ctx.db
        .query("carChecks")
        .withIndex("by_session_member", (q) => q.eq("sessionId", sid).eq("memberId", id))
        .take(MAX_ROWS);
      for (const c of cars) await ctx.db.delete("carChecks", c._id);
      const logs = await ctx.db
        .query("checkLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", sid))
        .take(MAX_ROWS);
      for (const l of logs) if (l.memberId === id) await ctx.db.delete("checkLogs", l._id);
    }
    await ctx.db.delete("members", id);
    return null;
  },
});

/**
 * 엑셀 일괄 등록. 서버에서도 다시 검증한다.
 * 결과: 행마다 ok(등록) / dup(같은 번호 회원 있음, 건너뜀) / bad(오류)
 */
export const importMany = adminMutation({
  args: {
    rows: v.array(
      v.object({
        name: v.string(),
        gender,
        phone: v.optional(v.string()),
        church: v.optional(v.string()),
        car: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const members = await allMembers(ctx);
    const phones = new Set(members.map((m) => m.phone).filter((p): p is string => !!p));
    const plates = new Set(members.flatMap((m) => m.cars));
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const r of rows) {
      const name = r.name.trim();
      const phone = r.phone ? normalizePhone(r.phone) : null;
      const plate = r.car ? normalizePlate(r.car) : null;
      if (!name || (r.phone && !phone) || (r.car && !plate) || (plate && plates.has(plate))) {
        failed++;
        continue;
      }
      if (phone && phones.has(phone)) {
        skipped++;
        continue;
      }
      await ctx.db.insert("members", {
        name,
        gender: r.gender,
        phone: phone ?? undefined,
        church: r.church?.trim() || undefined,
        cars: plate ? [plate] : [],
      });
      if (phone) phones.add(phone);
      if (plate) plates.add(plate);
      added++;
    }
    return { added, skipped, failed };
  },
});
