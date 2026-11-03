import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/auth";
import { MAX_ROWS, fieldError, type Ctx } from "./lib/data";
import { MSG_GROUP_NAME, MSG_KEY, MSG_LABEL, MSG_SYSTEM, SYSTEM_GROUPS, cleanLabel, isKey, isSystemGroup, normalizeKey } from "../lib/codes";

const MAX_GROUPS = 200;
const MAX_CODES = 500;

const codesOf = (ctx: Ctx, groupId: Id<"codeGroups">) =>
  ctx.db
    .query("codes")
    .withIndex("by_group_order", (q) => q.eq("groupId", groupId))
    .take(MAX_CODES);

const groupByKey = (ctx: Ctx, key: string) =>
  ctx.db
    .query("codeGroups")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

async function getGroup(ctx: Ctx, id: Id<"codeGroups">) {
  const g = await ctx.db.get("codeGroups", id);
  if (!g) throw new ConvexError("이미 삭제된 그룹이에요. 화면을 새로 고쳐 주세요.");
  return g;
}

async function getCode(ctx: Ctx, id: Id<"codes">) {
  const c = await ctx.db.get("codes", id);
  if (!c) throw new ConvexError("이미 삭제된 코드예요. 화면을 새로 고쳐 주세요.");
  return c;
}

/** 출석 메모에서 쓰인 횟수 (코드별) */
async function usage(ctx: Ctx) {
  const n = new Map<Id<"codes">, number>();
  for (const m of await ctx.db.query("checkMemos").take(MAX_ROWS)) for (const c of m.codeIds) n.set(c, (n.get(c) ?? 0) + 1);
  return n;
}

function cleanGroup(input: { key: string; name: string; description?: string }) {
  const key = normalizeKey(input.key);
  if (!isKey(key)) fieldError("key", MSG_KEY);
  const name = input.name.trim();
  if (!name) fieldError("name", MSG_GROUP_NAME);
  return { key, name, description: (input.description ?? "").trim() || undefined };
}

async function insertCode(ctx: MutationCtx, group: Doc<"codeGroups">, raw: string) {
  const label = cleanLabel(raw);
  if (!label) fieldError("label", MSG_LABEL);
  const list = await codesOf(ctx, group._id);
  if (list.some((c) => c.label === label)) fieldError("label", `‘${label}’은 이미 ${group.name}에 있어요.`);
  const order = list.reduce((m, c) => Math.max(m, c.order), 0) + 1;
  return await ctx.db.insert("codes", { groupId: group._id, label, order, active: true });
}

/** 그룹 목록 + 코드 수 + 아직 없는 기본 그룹 */
export const listGroups = adminQuery({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("codeGroups").withIndex("by_key").take(MAX_GROUPS);
    const rows = [];
    for (const g of groups) {
      const cs = await codesOf(ctx, g._id);
      rows.push({ ...g, system: isSystemGroup(g.key), count: cs.length, active: cs.filter((c) => c.active).length });
    }
    // 기본 그룹이 위로
    rows.sort((a, b) => Number(b.system) - Number(a.system) || a.key.localeCompare(b.key));
    const missing = SYSTEM_GROUPS.filter((s) => !groups.some((g) => g.key === s.key)).map((s) => ({ key: s.key, name: s.name }));
    return { groups: rows, missing };
  },
});

/** 한 그룹의 코드 (순서대로, 사용 횟수 포함) */
export const listCodes = adminQuery({
  args: { groupId: v.id("codeGroups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get("codeGroups", groupId);
    if (!group) return null;
    const used = await usage(ctx);
    const codes = (await codesOf(ctx, groupId)).map((c) => ({ ...c, used: used.get(c._id) ?? 0 }));
    return { group: { ...group, system: isSystemGroup(group.key) }, codes };
  },
});

/** 화면용: 그룹 키로 코드 찾기. 그룹이 없으면 null */
export const byKey = adminQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const group = await groupByKey(ctx, key);
    if (!group) return null;
    const codes = (await codesOf(ctx, group._id)).map((c) => ({ _id: c._id, label: c.label, active: c.active }));
    return { group: { _id: group._id, key: group.key, name: group.name }, codes };
  },
});

/** 없는 기본 그룹을 기본 코드와 함께 만든다 (이미 있으면 그대로) */
export const ensureSystemGroups = adminMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    for (const s of SYSTEM_GROUPS) {
      if (await groupByKey(ctx, s.key)) continue;
      const id = await ctx.db.insert("codeGroups", { key: s.key, name: s.name, description: s.description });
      for (const [i, label] of s.codes.entries()) await ctx.db.insert("codes", { groupId: id, label, order: i + 1, active: true });
      created++;
    }
    return { created };
  },
});

export const createGroup = adminMutation({
  args: { key: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const g = cleanGroup(args);
    const ex = await groupByKey(ctx, g.key);
    if (ex) fieldError("key", `${g.key}는 이미 ‘${ex.name}’ 그룹 키예요.`);
    return await ctx.db.insert("codeGroups", g);
  },
});

export const updateGroup = adminMutation({
  args: { id: v.id("codeGroups"), key: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { id, ...args }) => {
    const cur = await getGroup(ctx, id);
    const g = cleanGroup(args);
    if (g.key !== cur.key) {
      if (isSystemGroup(cur.key)) fieldError("key", MSG_SYSTEM);
      const ex = await groupByKey(ctx, g.key);
      if (ex) fieldError("key", `${g.key}는 이미 ‘${ex.name}’ 그룹 키예요.`);
    }
    await ctx.db.replace("codeGroups", id, g);
    return null;
  },
});

/** 그룹 삭제: 코드도 지우고, 출석 메모에서 그 코드들을 뺀다 */
export const removeGroup = adminMutation({
  args: { id: v.id("codeGroups") },
  handler: async (ctx, { id }) => {
    const g = await getGroup(ctx, id);
    if (isSystemGroup(g.key)) throw new ConvexError(MSG_SYSTEM);
    const ids = new Set<Id<"codes">>();
    for (const c of await codesOf(ctx, id)) {
      ids.add(c._id);
      await ctx.db.delete("codes", c._id);
    }
    await stripCodes(ctx, ids);
    await ctx.db.delete("codeGroups", id);
    return null;
  },
});

export const createCode = adminMutation({
  args: { groupId: v.id("codeGroups"), label: v.string() },
  handler: async (ctx, { groupId, label }) => insertCode(ctx, await getGroup(ctx, groupId), label),
});

export const updateCode = adminMutation({
  args: { id: v.id("codes"), label: v.string(), active: v.boolean() },
  handler: async (ctx, { id, label: raw, active }) => {
    const c = await getCode(ctx, id);
    const label = cleanLabel(raw);
    if (!label) fieldError("label", MSG_LABEL);
    if (label !== c.label && (await codesOf(ctx, c.groupId)).some((x) => x._id !== id && x.label === label)) {
      fieldError("label", `‘${label}’은 이미 이 그룹에 있어요.`);
    }
    await ctx.db.patch("codes", id, { label, active });
    return null;
  },
});

/** 순서 바꾸기: 위/아래 이웃과 order를 맞바꾼다 */
export const moveCode = adminMutation({
  args: { id: v.id("codes"), dir: v.union(v.literal(-1), v.literal(1)) },
  handler: async (ctx, { id, dir }) => {
    const c = await getCode(ctx, id);
    const list = await codesOf(ctx, c.groupId);
    const i = list.findIndex((x) => x._id === id);
    const o = list[i + dir];
    if (!o) return null;
    // order가 같아도 확실히 바뀌도록 순번으로 다시 매긴다
    const ordered = list.map((x) => x._id);
    [ordered[i], ordered[i + dir]] = [ordered[i + dir], ordered[i]];
    for (const [k, cid] of ordered.entries()) {
      const cur = list.find((x) => x._id === cid);
      if (cur && cur.order !== k + 1) await ctx.db.patch("codes", cid, { order: k + 1 });
    }
    return null;
  },
});

/** 코드 삭제: 출석 메모에서도 뺀다 */
export const removeCode = adminMutation({
  args: { id: v.id("codes") },
  handler: async (ctx, { id }) => {
    await getCode(ctx, id);
    await ctx.db.delete("codes", id);
    await stripCodes(ctx, new Set([id]));
    return null;
  },
});

/** 출석 메모에서 지운 코드를 빼고, 남은 내용이 없으면 메모를 지운다 */
async function stripCodes(ctx: MutationCtx, ids: Set<Id<"codes">>) {
  if (!ids.size) return;
  for (const m of await ctx.db.query("checkMemos").take(MAX_ROWS)) {
    if (!m.codeIds.some((c) => ids.has(c))) continue;
    const codeIds = m.codeIds.filter((c) => !ids.has(c));
    if (!codeIds.length && !m.text) await ctx.db.delete("checkMemos", m._id);
    else await ctx.db.patch("checkMemos", m._id, { codeIds });
  }
}
