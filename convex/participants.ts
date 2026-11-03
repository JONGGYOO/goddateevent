import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./lib/auth";
import {
  MAX_EVENTS,
  MAX_ROWS,
  allMembers,
  attendanceOf,
  getOrThrow,
  participantsOf,
  removeFromGroupings,
  sessionsOf,
} from "./lib/data";

/** 확정 인원 (회원 정보 조인 + 이 행사 출석 횟수) */
export const listByEvent = adminQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const parts = await participantsOf(ctx, eventId);
    const attendedBy = new Map<Id<"members">, number>();
    for (const s of await sessionsOf(ctx, eventId)) {
      for (const a of await attendanceOf(ctx, s._id)) attendedBy.set(a.memberId, (attendedBy.get(a.memberId) ?? 0) + 1);
    }
    const out = [];
    for (const p of parts) {
      const m = await ctx.db.get("members", p.memberId);
      if (!m) continue;
      out.push({
        _id: p._id,
        memberId: m._id,
        nameTagNo: p.nameTagNo,
        name: m.name,
        gender: m.gender,
        phone: m.phone ?? null,
        church: m.church ?? null,
        attended: attendedBy.get(m._id) ?? 0,
      });
    }
    return out;
  },
});

/** 이 행사에 아직 참여하지 않은 회원 + 과거 참여 행사 번호 */
export const pool = adminQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const members = await allMembers(ctx);
    const events = await ctx.db.query("events").take(MAX_EVENTS);
    const noOf = new Map(events.map((e) => [e._id, e.no]));
    const all = await ctx.db.query("participants").take(MAX_ROWS * 4);
    const inEvent = new Set<Id<"members">>();
    const history = new Map<Id<"members">, number[]>();
    for (const p of all) {
      if (p.eventId === eventId) inEvent.add(p.memberId);
      else {
        const no = noOf.get(p.eventId);
        if (no === undefined) continue;
        const list = history.get(p.memberId);
        if (list) list.push(no);
        else history.set(p.memberId, [no]);
      }
    }
    return members
      .filter((m) => !inEvent.has(m._id))
      .map((m) => ({
        _id: m._id,
        name: m.name,
        gender: m.gender,
        phone: m.phone ?? null,
        church: m.church ?? null,
        history: (history.get(m._id) ?? []).sort((a, b) => a - b),
      }));
  },
});

/** 선택한 회원을 참여 확정. 명찰 번호: 남 1번~, 여 101번~ 비어 있는 가장 작은 번호 */
export const addMany = adminMutation({
  args: { eventId: v.id("events"), memberIds: v.array(v.id("members")) },
  handler: async (ctx, { eventId, memberIds }) => {
    await getOrThrow(ctx, "events", eventId);
    const parts = await participantsOf(ctx, eventId);
    const already = new Set(parts.map((p) => p.memberId));
    const used = new Set(parts.map((p) => p.nameTagNo));
    let added = 0;
    for (const memberId of memberIds) {
      if (already.has(memberId)) continue;
      const m = await ctx.db.get("members", memberId);
      if (!m) continue;
      let tag = m.gender === "M" ? 1 : 101;
      while (used.has(tag)) tag++;
      used.add(tag);
      already.add(memberId);
      await ctx.db.insert("participants", { eventId, memberId, nameTagNo: tag });
      added++;
    }
    return { added };
  },
});

/** 참여자 제외: 조 편성에서도 빠짐. 출석 기록은 남긴다. */
export const remove = adminMutation({
  args: { eventId: v.id("events"), memberId: v.id("members") },
  handler: async (ctx, { eventId, memberId }) => {
    const p = await ctx.db
      .query("participants")
      .withIndex("by_event_member", (q) => q.eq("eventId", eventId).eq("memberId", memberId))
      .first();
    if (!p) throw new ConvexError("이미 참여 인원에서 빠진 분이에요.");
    await ctx.db.delete("participants", p._id);
    await removeFromGroupings(ctx, eventId, memberId);
    return null;
  },
});
