import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { adminQuery } from "./lib/auth";
import { MAX_EVENTS, MAX_ROWS, allMembers, attendanceOf, carChecksOf, participantsOf, sessionsOf } from "./lib/data";

/**
 * 행사별 통계 원자료. 출석률(오늘까지 진행된 회차만 분모) 계산은 클라이언트가 today로 한다.
 */
export const byEvent = adminQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (!event) return null;
    const people = [];
    const ids = new Set<Id<"members">>();
    for (const p of await participantsOf(ctx, eventId)) {
      const m = await ctx.db.get("members", p.memberId);
      if (!m) continue;
      ids.add(m._id);
      people.push({ memberId: m._id, name: m.name, gender: m.gender, cars: m.cars });
    }
    const sessions = [];
    for (const s of await sessionsOf(ctx, eventId)) {
      const att = (await attendanceOf(ctx, s._id)).filter((a) => ids.has(a.memberId)).map((a) => a.memberId);
      const carChecks = (await carChecksOf(ctx, s._id))
        .filter((c) => ids.has(c.memberId))
        .map((c) => ({ memberId: c.memberId, plate: c.plate, at: c.checkedAt }));
      sessions.push({ _id: s._id, no: s.no, date: s.date, attended: att, cars: carChecks.length, carChecks });
    }
    return { event: { _id: event._id, no: event.no, name: event.name }, people, sessions };
  },
});

/** 회원 누적 원자료: 회원별 참여 행사와 각 회차 출석 여부 */
export const byMember = adminQuery({
  args: {},
  handler: async (ctx) => {
    const members = await allMembers(ctx);
    const events = await ctx.db.query("events").withIndex("by_no").order("desc").take(MAX_EVENTS);
    const evs = [];
    for (const e of events) {
      const parts = await participantsOf(ctx, e._id);
      const sessions = [];
      for (const s of await sessionsOf(ctx, e._id)) {
        sessions.push({ date: s.date, attended: (await attendanceOf(ctx, s._id)).map((a) => a.memberId) });
      }
      evs.push({ _id: e._id, no: e.no, name: e.name, memberIds: parts.map((p) => p.memberId), sessions });
    }
    return {
      members: members.map((m) => ({ _id: m._id, name: m.name, gender: m.gender })),
      events: evs,
      truncated: members.length >= MAX_ROWS,
    };
  },
});
