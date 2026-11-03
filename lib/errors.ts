import { ConvexError } from "convex/values";

export type ErrInfo = { field?: string; message: string; unauthorized?: boolean };

/** Convex/네트워크 오류 → 화면에 보여줄 한국어 문구 */
export function errInfo(e: unknown): ErrInfo {
  if (e instanceof ConvexError) {
    const d: unknown = e.data;
    if (d === "UNAUTHORIZED") return { message: "로그인이 만료됐어요. 다시 로그인하세요.", unauthorized: true };
    if (typeof d === "string") return { message: d };
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      return {
        field: typeof o.field === "string" ? o.field : undefined,
        message: typeof o.message === "string" ? o.message : "처리하지 못했어요. 다시 시도해 주세요.",
      };
    }
  }
  if (e instanceof Error && e.message.includes("UNAUTHORIZED")) {
    return { message: "로그인이 만료됐어요. 다시 로그인하세요.", unauthorized: true };
  }
  return { message: "연결이 불안정해 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
}
