import { ConvexError, v } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { env, mutation, query } from "../_generated/server";
import { verifyToken, type Role } from "../../lib/token";
import { READ_ONLY } from "../../lib/errors";

/**
 * 모든 함수는 token 인자를 받아 HMAC·만료·역할을 검증한다.
 * - adminQuery: 관리자·스태프 모두 (조회)
 * - checkMutation: 관리자·스태프 모두 (출석체크 화면의 입력·수정)
 * - adminMutation: 관리자만 (그 밖의 모든 변경)
 * 쿼리에서 Date.now()는 쿼리 시작 시각으로 고정되므로 만료 직후 잠깐 구독이 유지될 수 있지만,
 * 다음 재실행이나 다음 요청에서 바로 거부된다.
 */
async function requireRole(token: string, allowed: readonly Role[]) {
  const role = await verifyToken(env.SESSION_SECRET, token);
  if (!role) throw new ConvexError("UNAUTHORIZED");
  if (!allowed.includes(role)) throw new ConvexError(READ_ONLY);
}

const ANY: readonly Role[] = ["admin", "staff"];
const ADMIN: readonly Role[] = ["admin"];

export const adminQuery = customQuery(query, {
  args: { token: v.string() },
  input: async (_ctx, { token }) => {
    await requireRole(token, ANY);
    return { ctx: {}, args: {} };
  },
});

export const checkMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (_ctx, { token }) => {
    await requireRole(token, ANY);
    return { ctx: {}, args: {} };
  },
});

export const adminMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (_ctx, { token }) => {
    await requireRole(token, ADMIN);
    return { ctx: {}, args: {} };
  },
});
