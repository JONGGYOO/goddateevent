import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizePhone, MSG_PHONE } from "../../lib/phone";
import { normalizePlate, MSG_FRONT } from "../../lib/plate";

// 이 앱은 관리자 1명이 쓰는 소규모 명부(수백 명, 행사 수십 개)라 상한을 넉넉히 둔다.
export const MAX_MEMBERS = 5000;
export const MAX_ROWS = 5000;
export const MAX_SESSIONS = 100;
export const MAX_EVENTS = 1000;

export type Gender = "M" | "F";

export const MSG_PARTS_LOCKED = "참여 인원이 확정돼 있어요. ‘확정 취소’를 누른 뒤 고치세요.";
export const MSG_GROUPS_LOCKED = "이 회차 조가 확정돼 있어요. ‘확정 취소’를 누른 뒤 고치세요.";
export type Ctx = QueryCtx | MutationCtx;

/** 필드별 오류. 클라이언트는 error.data.field / error.data.message 로 읽는다 */
export function fieldError(field: string, message: string): never {
  throw new ConvexError({ field, message });
}

export const allMembers = (ctx: Ctx) => ctx.db.query("members").take(MAX_MEMBERS);

/** 날짜 순 회차 + 회차 번호(1부터) */
export async function sessionsOf(ctx: Ctx, eventId: Id<"events">) {
  const list = await ctx.db
    .query("sessions")
    .withIndex("by_event_date", (q) => q.eq("eventId", eventId))
    .take(MAX_SESSIONS);
  return list.map((s, i) => ({ ...s, no: i + 1 }));
}

export const participantsOf = (ctx: Ctx, eventId: Id<"events">) =>
  ctx.db
    .query("participants")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(MAX_ROWS);

export const attendanceOf = (ctx: Ctx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("attendance")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(MAX_ROWS);

export const carChecksOf = (ctx: Ctx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("carChecks")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(MAX_ROWS);

export const memosOf = (ctx: Ctx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("checkMemos")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(MAX_ROWS);

/** 회차의 모든 조 편성 (기본 조 + 추가 조 종류) */
export const groupingsOf = (ctx: Ctx, sessionId: Id<"sessions">) =>
  ctx.db
    .query("groupings")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(100);

/** 회차의 조 편성 하나. kindId를 비우면 기본 조 */
export async function groupingOf(ctx: Ctx, sessionId: Id<"sessions">, kindId?: Id<"codes"> | null) {
  return (await groupingsOf(ctx, sessionId)).find((g) => (g.kindId ?? null) === (kindId ?? null)) ?? null;
}

export async function getOrThrow<T extends "members" | "events" | "sessions">(ctx: Ctx, table: T, id: Id<T>) {
  const doc = await ctx.db.get(table, id);
  if (!doc) throw new ConvexError("이미 삭제됐거나 찾을 수 없어요. 화면을 새로 고쳐 주세요.");
  return doc as Doc<T>;
}

export type MemberInput = {
  name: string;
  gender: Gender;
  phone?: string;
  church?: string;
  cars: string[];
  memo?: string;
};

export type CleanMember = {
  name: string;
  gender: Gender;
  phone?: string;
  church?: string;
  cars: string[];
  memo?: string;
};

/** 회원 입력 정리·검증 (이름 필수, 휴대폰/차량 형식·중복) */
export async function cleanMember(ctx: Ctx, input: MemberInput, exceptId?: Id<"members">): Promise<CleanMember> {
  const name = input.name.trim();
  if (!name) fieldError("name", "이름을 입력하세요.");
  let phone: string | undefined;
  const rawPhone = (input.phone ?? "").trim();
  if (rawPhone) {
    const p = normalizePhone(rawPhone);
    if (!p) fieldError("phone", MSG_PHONE);
    const owner = await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", p))
      .first();
    if (owner && owner._id !== exceptId) fieldError("phone", `이미 ${owner.name}님이 쓰는 번호예요.`);
    phone = p;
  }
  const cars: string[] = [];
  for (const c of input.cars) {
    const plate = normalizePlate(c);
    if (!plate) fieldError("car", MSG_FRONT);
    if (!cars.includes(plate)) cars.push(plate);
  }
  if (cars.length) {
    const owner = await findCarOwner(ctx, cars, exceptId);
    if (owner) fieldError("car", `이미 ${owner.member.name}님 차량으로 등록된 번호예요. (${owner.plate})`);
  }
  const church = (input.church ?? "").trim() || undefined;
  const memo = (input.memo ?? "").trim() || undefined;
  return { name, gender: input.gender, phone, church, cars, memo };
}

export async function findCarOwner(ctx: Ctx, plates: string[], exceptId?: Id<"members">) {
  const members = await allMembers(ctx);
  for (const m of members) {
    if (m._id === exceptId) continue;
    const plate = m.cars.find((c) => plates.includes(c));
    if (plate) return { member: m, plate };
  }
  return null;
}

/** 회차와 그 하위 기록 삭제 */
export async function deleteSessionCascade(ctx: MutationCtx, sessionId: Id<"sessions">) {
  for (const g of await groupingsOf(ctx, sessionId)) await ctx.db.delete("groupings", g._id);
  for (const a of await attendanceOf(ctx, sessionId)) await ctx.db.delete("attendance", a._id);
  for (const c of await carChecksOf(ctx, sessionId)) await ctx.db.delete("carChecks", c._id);
  const logs = await ctx.db
    .query("checkLogs")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(MAX_ROWS);
  for (const l of logs) await ctx.db.delete("checkLogs", l._id);
  for (const m of await memosOf(ctx, sessionId)) await ctx.db.delete("checkMemos", m._id);
  await ctx.db.delete("sessions", sessionId);
}

/** 해당 회원을 행사의 모든 회차 조 편성에서 뺀다 */
export async function removeFromGroupings(ctx: MutationCtx, eventId: Id<"events">, memberId: Id<"members">) {
  for (const s of await sessionsOf(ctx, eventId)) {
    for (const g of await groupingsOf(ctx, s._id)) {
      if (g.assignments.some((a) => a.memberId === memberId)) {
        await ctx.db.patch("groupings", g._id, { assignments: g.assignments.filter((a) => a.memberId !== memberId) });
      }
    }
  }
}

export async function addLog(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  memberId: Id<"members">,
  kind: Doc<"checkLogs">["kind"],
  at: number,
) {
  await ctx.db.insert("checkLogs", { sessionId, memberId, kind, at });
}
