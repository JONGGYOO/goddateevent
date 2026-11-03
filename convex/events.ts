import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./lib/auth";
import {
  MAX_EVENTS,
  attendanceOf,
  carChecksOf,
  deleteSessionCascade,
  fieldError,
  getOrThrow,
  groupingOf,
  participantsOf,
  sessionsOf,
  type Ctx,
} from "./lib/data";

async function genderCounts(ctx: Ctx, eventId: Id<"events">) {
  const parts = await participantsOf(ctx, eventId);
  let male = 0;
  let female = 0;
  const ids = new Set<Id<"members">>();
  for (const p of parts) {
    const m = await ctx.db.get("members", p.memberId);
    if (!m) continue;
    ids.add(m._id);
    if (m.gender === "M") male++;
    else female++;
  }
  return { male, female, ids };
}

/** 행사 목록 (최근 번호가 위). today는 "YYYY-MM-DD" (서울) */
export const list = adminQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const events = await ctx.db.query("events").withIndex("by_no").order("desc").take(MAX_EVENTS);
    return await Promise.all(
      events.map(async (e) => {
        const ss = await sessionsOf(ctx, e._id);
        const { male, female } = await genderCounts(ctx, e._id);
        const next = ss.find((s) => s.date >= today) ?? null;
        return {
          _id: e._id,
          no: e.no,
          name: e.name,
          sessionCount: ss.length,
          firstDate: ss[0]?.date ?? null,
          lastDate: ss[ss.length - 1]?.date ?? null,
          done: ss.filter((s) => s.date < today).length,
          next: next ? { no: next.no, date: next.date } : null,
          male,
          female,
        };
      }),
    );
  },
});

/** 행사 상세 상단 탭·회차 관리 화면용 요약 */
export const overview = adminQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (!event) return null;
    const { male, female, ids } = await genderCounts(ctx, eventId);
    const ss = await sessionsOf(ctx, eventId);
    const sessions = await Promise.all(
      ss.map(async (s) => {
        const att = await attendanceOf(ctx, s._id);
        const cars = await carChecksOf(ctx, s._id);
        const g = await groupingOf(ctx, s._id);
        return {
          _id: s._id,
          date: s.date,
          no: s.no,
          attended: att.filter((a) => ids.has(a.memberId)).length,
          attendanceTotal: att.length,
          cars: cars.length,
          groupCount: g ? g.groupCount : null,
        };
      }),
    );
    return { event, male, female, participantCount: male + female, sessions };
  },
});

async function validateEvent(ctx: Ctx, no: number, name: string, exceptId?: Id<"events">) {
  if (!Number.isInteger(no) || no < 1 || no > 999) fieldError("no", "회차는 1 이상의 숫자로 입력하세요.");
  const dup = await ctx.db
    .query("events")
    .withIndex("by_no", (q) => q.eq("no", no))
    .first();
  if (dup && dup._id !== exceptId) fieldError("no", `제${no}회는 이미 ‘${dup.name}’로 등록돼 있어요.`);
  const n = name.trim();
  if (!n) fieldError("name", "행사 이름을 입력하세요.");
  if (n.length > 40) fieldError("name", "행사 이름은 40자 이내로 입력하세요.");
  return n;
}

/** no를 비우면 다음 번호 */
export const create = adminMutation({
  args: { no: v.optional(v.number()), name: v.string() },
  handler: async (ctx, args) => {
    let no = args.no;
    if (no === undefined) {
      const last = await ctx.db.query("events").withIndex("by_no").order("desc").first();
      no = (last?.no ?? 0) + 1;
    }
    const name = await validateEvent(ctx, no, args.name);
    const id = await ctx.db.insert("events", { no, name });
    return { id, no, name };
  },
});

export const update = adminMutation({
  args: { id: v.id("events"), no: v.number(), name: v.string() },
  handler: async (ctx, { id, no, name }) => {
    await getOrThrow(ctx, "events", id);
    const n = await validateEvent(ctx, no, name, id);
    await ctx.db.patch("events", id, { no, name: n });
    return null;
  },
});

/** 행사 삭제: 회차(+조 편성/출석/차량/로그)와 참여 인원 함께 삭제 */
export const remove = adminMutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const event = await ctx.db.get("events", id);
    if (!event) throw new ConvexError("이미 삭제된 행사예요.");
    for (const s of await sessionsOf(ctx, id)) await deleteSessionCascade(ctx, s._id);
    for (const p of await participantsOf(ctx, id)) await ctx.db.delete("participants", p._id);
    await ctx.db.delete("events", id);
    return null;
  },
});
