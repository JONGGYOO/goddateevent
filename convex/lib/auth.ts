import { ConvexError, v } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { env, mutation, query } from "../_generated/server";
import { verifyToken } from "../../lib/token";

/**
 * 모든 관리자 함수는 token 인자를 받아 HMAC·만료를 검증한다.
 * 쿼리에서 Date.now()는 쿼리 시작 시각으로 고정되므로 만료 직후 잠깐 구독이 유지될 수 있지만,
 * 다음 재실행이나 다음 요청에서 바로 거부된다.
 */
async function requireAdmin(token: string) {
  if (!(await verifyToken(env.SESSION_SECRET, token))) {
    throw new ConvexError("UNAUTHORIZED");
  }
}

export const adminQuery = customQuery(query, {
  args: { token: v.string() },
  input: async (_ctx, { token }) => {
    await requireAdmin(token);
    return { ctx: {}, args: {} };
  },
});

export const adminMutation = customMutation(mutation, {
  args: { token: v.string() },
  input: async (_ctx, { token }) => {
    await requireAdmin(token);
    return { ctx: {}, args: {} };
  },
});
