import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./lib/auth";
import { MSG_GROUPS_LOCKED, attendanceOf, getOrThrow, groupingOf, groupingsOf, participantsOf, sessionsOf, type Ctx } from "./lib/data";
import { findOrCreateCode } from "./codes";
import { GROUP_KIND } from "../lib/codes";
import { defaultGroupCount } from "../lib/grouping";

/**
 * 조 편성. 회차마다 기본 조(kindId 없음) 하나 + 추가 조 종류(식사조·게임조 등, kindId = 공통코드 GROUP_KIND).
 * 기본 조 대상은 참여자 전체, 추가 조 종류 대상은 그 회차 출석자.
 */
const kindArg = v.optional(v.id("codes"));

const labelOf = async (ctx: Ctx, id: Id<"codes">) => (await ctx.db.get("codes", id))?.label ?? "(지워진 종류)";

/** 대상 인원 id: 기본 조 = 참여자, 추가 조 종류 = 참여자 중 그 회차 출석자 */
async function targetIds(ctx: Ctx, session: Doc<"sessions">, kindId: Id<"codes"> | undefined) {
  const parts = new Set((await participantsOf(ctx, session.eventId)).map((p) => p.memberId));
  if (!kindId) return parts;
  const att = new Set((await attendanceOf(ctx, session._id)).map((a) => a.memberId));
  return new Set([...parts].filter((id) => att.has(id)));
}

/** 조 편성 화면 데이터: 이 회차·종류 편성 + 겹침 비교용 이전 편성 + 대상 인원 + 이 회차의 조 종류 목록 */
export const getBySession = adminQuery({
  args: { sessionId: v.id("sessions"), kindId: kindArg },
  handler: async (ctx, { sessionId, kindId }) => {
    const session = await ctx.db.get("sessions", sessionId);
    if (!session) return null;
    const ss = await sessionsOf(ctx, session.eventId);
    const cur = ss.find((s) => s._id === sessionId);
    if (!cur) return null;

    const all = await groupingsOf(ctx, sessionId);
    const kinds = [];
    for (const g of all) {
      if (g.kindId) kinds.push({ kindId: g.kindId, label: await labelOf(ctx, g.kindId), groupCount: g.groupCount, locked: g.locked ?? false });
    }
    kinds.sort((a, b) => a.label.localeCompare(b.label, "ko"));
    const kind = kindId ? (kinds.find((k) => k.kindId === kindId) ?? null) : null;
    if (kindId && !kind) return { missingKind: true as const };

    const grouping = all.find((g) => (g.kindId ?? null) === (kindId ?? null)) ?? null;

    // 겹침 비교는 이전 회차만: 기본 조 = 이전 회차 기본 조, 추가 종류 = 이전 회차의 기본 조 + 같은 종류.
    // (같은 회차 기본 조는 비교하지 않는다. 추가 종류는 기본 조를 복사해서 시작하므로 비교하면 모두 재회로 보인다)
    const prior = [];
    for (const s of ss) {
      if (s.no >= cur.no) continue;
      const g = await groupingOf(ctx, s._id, kindId);
      if (g) prior.push({ no: s.no, label: `${s.no}회차${kind ? ` ${kind.label}` : ""}`, groupCount: g.groupCount, assignments: g.assignments, same: true });
      if (kindId) {
        const b = await groupingOf(ctx, s._id);
        if (b) prior.push({ no: s.no, label: `${s.no}회차 기본 조`, groupCount: b.groupCount, assignments: b.assignments, same: false });
      }
    }
    // 추가 종류 화면의 "기본 조 불러오기"용: 같은 회차 기본 조
    const sessionBase = kindId ? all.find((g) => !g.kindId) : undefined;

    const ids = await targetIds(ctx, session, kindId);
    const people = [];
    for (const id of ids) {
      const m = await ctx.db.get("members", id);
      if (m) people.push({ memberId: m._id, name: m.name, gender: m.gender });
    }
    const participantCount = (await participantsOf(ctx, session.eventId)).length;
    return {
      missingKind: false as const,
      session: { _id: cur._id, no: cur.no, date: cur.date },
      kind,
      kinds,
      grouping: grouping ? { groupCount: grouping.groupCount, assignments: grouping.assignments, locked: grouping.locked ?? false } : null,
      prior,
      base: sessionBase ? { groupCount: sessionBase.groupCount, assignments: sessionBase.assignments } : null,
      people,
      participantCount,
    };
  },
});

/** 편성 저장 (자동 저장). 대상이 아닌 사람·범위 밖 조 번호는 버린다. */
export const save = adminMutation({
  args: {
    sessionId: v.id("sessions"),
    kindId: kindArg,
    groupCount: v.number(),
    assignments: v.array(v.object({ memberId: v.id("members"), group: v.number() })),
  },
  handler: async (ctx, { sessionId, kindId, groupCount, assignments }) => {
    const session = await getOrThrow(ctx, "sessions", sessionId);
    if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > 12) {
      throw new ConvexError("조 개수는 2~12개로 정하세요.");
    }
    const existing = await groupingOf(ctx, sessionId, kindId);
    if (existing?.locked) throw new ConvexError(MSG_GROUPS_LOCKED);
    if (kindId && !existing) throw new ConvexError("이 회차에 없는 조 종류예요. 화면을 새로 고쳐 주세요.");
    const allowed = await targetIds(ctx, session, kindId);
    const seen = new Set<string>();
    const clean = assignments.filter((a) => {
      if (!allowed.has(a.memberId) || seen.has(a.memberId)) return false;
      if (!Number.isInteger(a.group) || a.group < 0 || a.group >= groupCount) return false;
      seen.add(a.memberId);
      return true;
    });
    if (existing) await ctx.db.patch("groupings", existing._id, { groupCount, assignments: clean });
    else await ctx.db.insert("groupings", { sessionId, groupCount, assignments: clean });
    return null;
  },
});

/** 조 확정 / 확정 취소 */
export const setLocked = adminMutation({
  args: { sessionId: v.id("sessions"), kindId: kindArg, locked: v.boolean() },
  handler: async (ctx, { sessionId, kindId, locked }) => {
    await getOrThrow(ctx, "sessions", sessionId);
    const g = await groupingOf(ctx, sessionId, kindId);
    if (!g || (locked && !g.assignments.length)) {
      if (locked) throw new ConvexError("확정할 조 편성이 없어요. 먼저 조를 나눠 주세요.");
      return null;
    }
    await ctx.db.patch("groupings", g._id, { locked });
    return null;
  },
});

/** 조 종류 추가: 글자로 적은 종류를 공통코드(GROUP_KIND)에서 찾거나 만들고,
 *  이 회차 기본 조 배정(출석자만)을 복사한 편성으로 시작한다. 기본 조가 없으면 빈 편성 */
export const addKind = adminMutation({
  args: { sessionId: v.id("sessions"), label: v.string() },
  handler: async (ctx, { sessionId, label }) => {
    const session = await getOrThrow(ctx, "sessions", sessionId);
    const code = await findOrCreateCode(ctx, GROUP_KIND, label);
    if (await groupingOf(ctx, sessionId, code._id)) throw new ConvexError(`이 회차에는 이미 ‘${code.label}’이 있어요.`);
    const base = await groupingOf(ctx, sessionId);
    const n = (await participantsOf(ctx, session.eventId)).length;
    const allowed = await targetIds(ctx, session, code._id);
    const groupCount = base?.groupCount ?? defaultGroupCount(n);
    const assignments = (base?.assignments ?? []).filter((a) => allowed.has(a.memberId) && a.group < groupCount);
    await ctx.db.insert("groupings", { sessionId, kindId: code._id, groupCount, assignments });
    return { ...code, copied: assignments.length, fromBase: !!base };
  },
});

/** 조 종류 삭제 (이 회차에서만). 확정 중이면 거부 */
export const removeKind = adminMutation({
  args: { sessionId: v.id("sessions"), kindId: v.id("codes") },
  handler: async (ctx, { sessionId, kindId }) => {
    const g = await groupingOf(ctx, sessionId, kindId);
    if (!g) return null;
    if (g.locked) throw new ConvexError(MSG_GROUPS_LOCKED);
    await ctx.db.delete("groupings", g._id);
    return null;
  },
});
