import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/auth";
import { gender } from "./schema";
import {
  MAX_ROWS,
  addLog,
  attendanceOf,
  carChecksOf,
  cleanMember,
  fieldError,
  findCarOwner,
  getOrThrow,
  groupingOf,
  groupingsOf,
  memosOf,
  participantsOf,
  sessionsOf,
} from "./lib/data";
import { normalizePhone } from "../lib/phone";
import { normalizePlate, MSG_FRONT } from "../lib/plate";
import { MAX_MEMO_TEXT } from "../lib/codes";

/** 출석 화면 한 번에: 참여자 + 출석 + 차량 + 조 번호 + 출석 메모 + 최근 로그 */
export const boardBySession = adminQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const ss = await sessionsOf(ctx, session.eventId);
    const no = ss.find((s) => s._id === sessionId)?.no ?? 0;
    const att = new Map((await attendanceOf(ctx, sessionId)).map((a) => [a.memberId, a]));
    const cars = new Map((await carChecksOf(ctx, sessionId)).map((c) => [c.memberId, c]));
    const memos = new Map((await memosOf(ctx, sessionId)).map((m) => [m.memberId, m]));
    const labels = new Map<Id<"codes">, string | null>();
    const labelOf = async (id: Id<"codes">) => {
      if (!labels.has(id)) labels.set(id, (await ctx.db.get("codes", id))?.label ?? null);
      return labels.get(id) ?? null;
    };
    const groupOf = new Map<Id<"members">, number>();
    // 추가 조 종류(식사조·게임조 등): 회원별 [{label, group}]
    const extraOf = new Map<Id<"members">, { label: string; group: number }[]>();
    for (const g of await groupingsOf(ctx, sessionId)) {
      const label = g.kindId ? await labelOf(g.kindId) : null;
      if (g.kindId && !label) continue;
      for (const a of g.assignments) {
        if (a.group >= g.groupCount) continue;
        if (!label) groupOf.set(a.memberId, a.group + 1);
        else extraOf.set(a.memberId, [...(extraOf.get(a.memberId) ?? []), { label, group: a.group + 1 }]);
      }
    }

    const people = [];
    const names = new Map<Id<"members">, { name: string; gender: "M" | "F" }>();
    for (const p of await participantsOf(ctx, session.eventId)) {
      const m = await ctx.db.get("members", p.memberId);
      if (!m) continue;
      names.set(m._id, { name: m.name, gender: m.gender });
      const a = att.get(m._id);
      const c = cars.get(m._id);
      const mm = memos.get(m._id);
      let memo = null;
      if (mm) {
        const codes = [];
        for (const id of mm.codeIds) {
          const label = await labelOf(id);
          if (label) codes.push({ _id: id, label });
        }
        memo = { codes, text: mm.text ?? null, at: mm.updatedAt };
      }
      people.push({
        memberId: m._id,
        name: m.name,
        gender: m.gender,
        phone: m.phone ?? null,
        cars: m.cars,
        group: groupOf.get(m._id) ?? null,
        extraGroups: (extraOf.get(m._id) ?? []).sort((x, y) => x.label.localeCompare(y.label, "ko")),
        att: a ? { at: a.checkedAt } : null,
        car: c ? { plate: c.plate, at: c.checkedAt } : null,
        memo,
      });
    }

    const rawLogs = await ctx.db
      .query("checkLogs")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(60);
    const logs = [];
    for (const l of rawLogs) {
      let who = names.get(l.memberId);
      if (!who) {
        const m = await ctx.db.get("members", l.memberId);
        if (!m) continue;
        who = { name: m.name, gender: m.gender };
      }
      logs.push({ _id: l._id, at: l.at, kind: l.kind, name: who.name, gender: who.gender });
    }
    logs.sort((a, b) => b.at - a.at);

    return {
      session: { _id: session._id, eventId: session.eventId, date: session.date, no },
      people,
      logs: logs.slice(0, 40),
    };
  },
});

async function requireParticipant(ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">) {
  const session = await getOrThrow(ctx, "sessions", sessionId);
  const p = await ctx.db
    .query("participants")
    .withIndex("by_event_member", (q) => q.eq("eventId", session.eventId).eq("memberId", memberId))
    .first();
  if (!p) throw new ConvexError("이 행사 참여 인원이 아니에요. 1단계 참여 인원에서 먼저 추가하세요.");
  const member = await getOrThrow(ctx, "members", memberId);
  return { session, participant: p, member };
}

async function groupNoOf(ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">) {
  const g = await groupingOf(ctx, sessionId);
  const a = g?.assignments.find((x) => x.memberId === memberId);
  return g && a && a.group < g.groupCount ? a.group + 1 : null;
}

const findAttendance = (ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">) =>
  ctx.db
    .query("attendance")
    .withIndex("by_session_member", (q) => q.eq("sessionId", sessionId).eq("memberId", memberId))
    .first();

const findCarCheck = (ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">) =>
  ctx.db
    .query("carChecks")
    .withIndex("by_session_member", (q) => q.eq("sessionId", sessionId).eq("memberId", memberId))
    .first();

/** 출석 (멱등): 이미 출석이면 기존 값을 그대로 돌려준다 */
export const checkIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members") },
  handler: async (ctx, { sessionId, memberId }) => {
    const { member } = await requireParticipant(ctx, sessionId, memberId);
    const group = await groupNoOf(ctx, sessionId, memberId);
    const existing = await findAttendance(ctx, sessionId, memberId);
    if (existing) {
      return { created: false, at: existing.checkedAt, group, name: member.name };
    }
    const at = Date.now();
    await ctx.db.insert("attendance", { sessionId, memberId, checkedAt: at });
    await addLog(ctx, sessionId, memberId, "in", at);
    return { created: true, at, group, name: member.name };
  },
});

/** 출석 취소. undo=true(토스트 되돌리기)면 방금 남긴 출석 로그를 지우고, 아니면 "출석 취소" 로그를 남긴다 */
export const cancelCheckIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), undo: v.optional(v.boolean()) },
  handler: async (ctx, { sessionId, memberId, undo }) => {
    const existing = await findAttendance(ctx, sessionId, memberId);
    if (!existing) return null;
    await ctx.db.delete("attendance", existing._id);
    if (undo) {
      const logs = await ctx.db
        .query("checkLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .order("desc")
        .take(MAX_ROWS);
      const last = logs.find((l) => l.memberId === memberId && l.kind === "in");
      if (last) await ctx.db.delete("checkLogs", last._id);
    } else {
      await addLog(ctx, sessionId, memberId, "out", Date.now());
    }
    return null;
  },
});

async function doCarIn(ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">, plate: string) {
  const at = Date.now();
  const existing = await findCarCheck(ctx, sessionId, memberId);
  if (existing) await ctx.db.patch("carChecks", existing._id, { plate, checkedAt: at });
  else await ctx.db.insert("carChecks", { sessionId, memberId, plate, checkedAt: at });
  await addLog(ctx, sessionId, memberId, "car", at);
  return at;
}

/** 등록된 차량 도착 체크 */
export const carIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), plate: v.string() },
  handler: async (ctx, { sessionId, memberId, plate }) => {
    const { member } = await requireParticipant(ctx, sessionId, memberId);
    if (!member.cars.includes(plate)) throw new ConvexError("이 회원에게 등록된 차량이 아니에요.");
    const at = await doCarIn(ctx, sessionId, memberId, plate);
    return { at };
  },
});

/** 차량 도착 취소. undo=true면 방금 남긴 도착 로그를 지운다 */
export const carOut = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), undo: v.optional(v.boolean()) },
  handler: async (ctx, { sessionId, memberId, undo }) => {
    const existing = await findCarCheck(ctx, sessionId, memberId);
    if (!existing) return null;
    await ctx.db.delete("carChecks", existing._id);
    if (undo) {
      const logs = await ctx.db
        .query("checkLogs")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .order("desc")
        .take(MAX_ROWS);
      const last = logs.find((l) => l.memberId === memberId && l.kind === "car");
      if (last) await ctx.db.delete("checkLogs", last._id);
    } else {
      await addLog(ctx, sessionId, memberId, "carout", Date.now());
    }
    return null;
  },
});

/** 미등록 차량: 회원 차량에 저장하고 도착 체크 */
export const registerPlateAndCarIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), plate: v.string() },
  handler: async (ctx, { sessionId, memberId, plate }) => {
    const { member } = await requireParticipant(ctx, sessionId, memberId);
    const p = normalizePlate(plate);
    if (!p) fieldError("car", MSG_FRONT);
    const owner = await findCarOwner(ctx, [p], memberId);
    if (owner) fieldError("car", `이미 ${owner.member.name}님 차량으로 등록된 번호예요.`);
    if (!member.cars.includes(p)) await ctx.db.patch("members", memberId, { cars: [...member.cars, p] });
    const at = await doCarIn(ctx, sessionId, memberId, p);
    return { plate: p, at };
  },
});

/** 출석 메모 저장: 공통코드(CHECK_MEMO 등) 선택 + 짧은 글. 둘 다 비우면 메모를 지운다 */
export const setMemo = adminMutation({
  args: {
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    codeIds: v.array(v.id("codes")),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, memberId, codeIds, text }) => {
    await requireParticipant(ctx, sessionId, memberId);
    const ids = [...new Set(codeIds)];
    for (const id of ids) {
      if (!(await ctx.db.get("codes", id))) throw new ConvexError("지워진 코드가 있어요. 메모 창을 닫고 다시 열어 주세요.");
    }
    const t = (text ?? "").trim();
    if (t.length > MAX_MEMO_TEXT) fieldError("text", `메모는 ${MAX_MEMO_TEXT}자까지 쓸 수 있어요.`);
    const ex = await ctx.db
      .query("checkMemos")
      .withIndex("by_session_member", (q) => q.eq("sessionId", sessionId).eq("memberId", memberId))
      .first();
    if (!ids.length && !t) {
      if (ex) await ctx.db.delete("checkMemos", ex._id);
      return null;
    }
    const doc = { sessionId, memberId, codeIds: ids, text: t || undefined, updatedAt: Date.now() };
    if (ex) await ctx.db.replace("checkMemos", ex._id, doc);
    else await ctx.db.insert("checkMemos", doc);
    return null;
  },
});

/** 현장 등록: 회원 생성 → 참여자 추가 → 출석 → (차량 입력 시) 차량 등록·도착 */
export const walkIn = adminMutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
    gender,
    phone: v.optional(v.string()),
    plate: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, name, gender, phone, plate }) => {
    const session = await getOrThrow(ctx, "sessions", sessionId);
    const rawPhone = (phone ?? "").trim();
    if (rawPhone) {
      const p = normalizePhone(rawPhone);
      if (p) {
        const ex = await ctx.db
          .query("members")
          .withIndex("by_phone", (q) => q.eq("phone", p))
          .first();
        if (ex) fieldError("phone", `이미 회원인 ${ex.name}님의 번호예요. 참여 인원에 없다면 1단계 참여 인원에서 추가하세요.`);
      }
    }
    const clean = await cleanMember(ctx, {
      name,
      gender,
      phone: rawPhone || undefined,
      cars: plate ? [plate] : [],
      memo: "현장 등록",
    });
    const memberId = await ctx.db.insert("members", clean);
    await ctx.db.insert("participants", { eventId: session.eventId, memberId });
    if (clean.cars[0]) await doCarIn(ctx, sessionId, memberId, clean.cars[0]);
    const at = Date.now();
    await ctx.db.insert("attendance", { sessionId, memberId, checkedAt: at });
    await addLog(ctx, sessionId, memberId, "in", at);
    return { memberId, at, name: clean.name };
  },
});
