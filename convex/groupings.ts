import { ConvexError, v } from "convex/values";
import { adminMutation, adminQuery } from "./lib/auth";
import { getOrThrow, groupingOf, participantsOf, sessionsOf } from "./lib/data";

/** 조 편성 화면 데이터: 이 회차 편성 + 같은 행사 이전 회차 편성 + 참여자 */
export const getBySession = adminQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const ss = await sessionsOf(ctx, session.eventId);
    const cur = ss.find((s) => s._id === sessionId);
    if (!cur) return null;
    const grouping = await groupingOf(ctx, sessionId);
    const prior = [];
    for (const s of ss) {
      if (s.no >= cur.no) continue;
      const g = await groupingOf(ctx, s._id);
      if (g) prior.push({ sessionId: s._id, no: s.no, groupCount: g.groupCount, assignments: g.assignments });
    }
    const people = [];
    for (const p of await participantsOf(ctx, session.eventId)) {
      const m = await ctx.db.get("members", p.memberId);
      if (m) people.push({ memberId: m._id, name: m.name, gender: m.gender });
    }
    return {
      session: { _id: cur._id, no: cur.no, date: cur.date },
      grouping: grouping ? { groupCount: grouping.groupCount, assignments: grouping.assignments } : null,
      prior,
      people,
    };
  },
});

/** 같은 행사의 이전 회차 편성들 */
export const listPriorBySession = adminQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return [];
    const ss = await sessionsOf(ctx, session.eventId);
    const cur = ss.find((s) => s._id === sessionId);
    const out = [];
    for (const s of ss) {
      if (!cur || s.no >= cur.no) continue;
      const g = await groupingOf(ctx, s._id);
      if (g) out.push({ sessionId: s._id, no: s.no, groupCount: g.groupCount, assignments: g.assignments });
    }
    return out;
  },
});

/** 편성 저장 (자동 저장). 참여자가 아닌 사람·범위 밖 조 번호는 버린다. */
export const save = adminMutation({
  args: {
    sessionId: v.id("sessions"),
    groupCount: v.number(),
    assignments: v.array(v.object({ memberId: v.id("members"), group: v.number() })),
  },
  handler: async (ctx, { sessionId, groupCount, assignments }) => {
    const session = await getOrThrow(ctx, "sessions", sessionId);
    if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > 12) {
      throw new ConvexError("조 개수는 2~12개로 정하세요.");
    }
    const partIds = new Set((await participantsOf(ctx, session.eventId)).map((p) => p.memberId));
    const seen = new Set<string>();
    const clean = assignments.filter((a) => {
      if (!partIds.has(a.memberId) || seen.has(a.memberId)) return false;
      if (!Number.isInteger(a.group) || a.group < 0 || a.group >= groupCount) return false;
      seen.add(a.memberId);
      return true;
    });
    const existing = await groupingOf(ctx, sessionId);
    if (existing) await ctx.db.patch("groupings", existing._id, { groupCount, assignments: clean });
    else await ctx.db.insert("groupings", { sessionId, groupCount, assignments: clean });
    return null;
  },
});
