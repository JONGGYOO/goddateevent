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
  nextNameTag,
  participantsOf,
  sessionsOf,
} from "./lib/data";
import { normalizePhone } from "../lib/phone";
import { normalizePlate, MSG_FRONT } from "../lib/plate";

const device = v.union(v.literal("A"), v.literal("B"));

/** 출석 화면 한 번에: 참여자 + 출석 + 차량 + 조 번호 + 최근 로그 */
export const boardBySession = adminQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const ss = await sessionsOf(ctx, session.eventId);
    const no = ss.find((s) => s._id === sessionId)?.no ?? 0;
    const att = new Map((await attendanceOf(ctx, sessionId)).map((a) => [a.memberId, a]));
    const cars = new Map((await carChecksOf(ctx, sessionId)).map((c) => [c.memberId, c]));
    const g = await groupingOf(ctx, sessionId);
    const groupOf = new Map<Id<"members">, number>();
    if (g) for (const a of g.assignments) if (a.group < g.groupCount) groupOf.set(a.memberId, a.group + 1);

    const people = [];
    const names = new Map<Id<"members">, { name: string; gender: "M" | "F" }>();
    for (const p of await participantsOf(ctx, session.eventId)) {
      const m = await ctx.db.get("members", p.memberId);
      if (!m) continue;
      names.set(m._id, { name: m.name, gender: m.gender });
      const a = att.get(m._id);
      const c = cars.get(m._id);
      people.push({
        memberId: m._id,
        name: m.name,
        gender: m.gender,
        phone: m.phone ?? null,
        cars: m.cars,
        nameTagNo: p.nameTagNo,
        group: groupOf.get(m._id) ?? null,
        att: a ? { at: a.checkedAt, device: a.device } : null,
        car: c ? { plate: c.plate, at: c.checkedAt, device: c.device } : null,
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
      logs.push({ _id: l._id, at: l.at, kind: l.kind, device: l.device, name: who.name, gender: who.gender });
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
  if (!p) throw new ConvexError("이 행사 참여 인원이 아니에요. 2단계에서 먼저 추가하세요.");
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
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), device },
  handler: async (ctx, { sessionId, memberId, device }) => {
    const { participant, member } = await requireParticipant(ctx, sessionId, memberId);
    const group = await groupNoOf(ctx, sessionId, memberId);
    const existing = await findAttendance(ctx, sessionId, memberId);
    if (existing) {
      return { created: false, at: existing.checkedAt, device: existing.device, group, nameTagNo: participant.nameTagNo, name: member.name };
    }
    const at = Date.now();
    await ctx.db.insert("attendance", { sessionId, memberId, checkedAt: at, device });
    await addLog(ctx, sessionId, memberId, "in", device, at);
    return { created: true, at, device, group, nameTagNo: participant.nameTagNo, name: member.name };
  },
});

/** 출석 취소. undo=true(토스트 되돌리기)면 방금 남긴 출석 로그를 지우고, 아니면 "출석 취소" 로그를 남긴다 */
export const cancelCheckIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), device, undo: v.optional(v.boolean()) },
  handler: async (ctx, { sessionId, memberId, device, undo }) => {
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
      await addLog(ctx, sessionId, memberId, "out", device, Date.now());
    }
    return null;
  },
});

async function doCarIn(ctx: MutationCtx, sessionId: Id<"sessions">, memberId: Id<"members">, plate: string, device: string) {
  const at = Date.now();
  const existing = await findCarCheck(ctx, sessionId, memberId);
  if (existing) await ctx.db.patch("carChecks", existing._id, { plate, checkedAt: at, device });
  else await ctx.db.insert("carChecks", { sessionId, memberId, plate, checkedAt: at, device });
  await addLog(ctx, sessionId, memberId, "car", device, at);
  return at;
}

/** 등록된 차량 도착 체크 */
export const carIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), plate: v.string(), device },
  handler: async (ctx, { sessionId, memberId, plate, device }) => {
    const { member } = await requireParticipant(ctx, sessionId, memberId);
    if (!member.cars.includes(plate)) throw new ConvexError("이 회원에게 등록된 차량이 아니에요.");
    const at = await doCarIn(ctx, sessionId, memberId, plate, device);
    return { at };
  },
});

/** 차량 도착 취소. undo=true면 방금 남긴 도착 로그를 지운다 */
export const carOut = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), device, undo: v.optional(v.boolean()) },
  handler: async (ctx, { sessionId, memberId, device, undo }) => {
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
      await addLog(ctx, sessionId, memberId, "carout", device, Date.now());
    }
    return null;
  },
});

/** 미등록 차량: 회원 차량에 저장하고 도착 체크 */
export const registerPlateAndCarIn = adminMutation({
  args: { sessionId: v.id("sessions"), memberId: v.id("members"), plate: v.string(), device },
  handler: async (ctx, { sessionId, memberId, plate, device }) => {
    const { member } = await requireParticipant(ctx, sessionId, memberId);
    const p = normalizePlate(plate);
    if (!p) fieldError("car", MSG_FRONT);
    const owner = await findCarOwner(ctx, [p], memberId);
    if (owner) fieldError("car", `이미 ${owner.member.name}님 차량으로 등록된 번호예요.`);
    if (!member.cars.includes(p)) await ctx.db.patch("members", memberId, { cars: [...member.cars, p] });
    const at = await doCarIn(ctx, sessionId, memberId, p, device);
    return { plate: p, at };
  },
});

/** 현장 등록: 회원 생성 → 참여자 추가(명찰 자동) → 출석 → (차량 입력 시) 차량 등록·도착 */
export const walkIn = adminMutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
    gender,
    phone: v.optional(v.string()),
    plate: v.optional(v.string()),
    device,
  },
  handler: async (ctx, { sessionId, name, gender, phone, plate, device }) => {
    const session = await getOrThrow(ctx, "sessions", sessionId);
    const rawPhone = (phone ?? "").trim();
    if (rawPhone) {
      const p = normalizePhone(rawPhone);
      if (p) {
        const ex = await ctx.db
          .query("members")
          .withIndex("by_phone", (q) => q.eq("phone", p))
          .first();
        if (ex) fieldError("phone", `이미 회원인 ${ex.name}님의 번호예요. 참여 인원에 없다면 2단계에서 추가하세요.`);
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
    const nameTagNo = await nextNameTag(ctx, session.eventId, gender);
    await ctx.db.insert("participants", { eventId: session.eventId, memberId, nameTagNo });
    if (clean.cars[0]) await doCarIn(ctx, sessionId, memberId, clean.cars[0], device);
    const at = Date.now();
    await ctx.db.insert("attendance", { sessionId, memberId, checkedAt: at, device });
    await addLog(ctx, sessionId, memberId, "in", device, at);
    return { memberId, nameTagNo, at, name: clean.name };
  },
});
