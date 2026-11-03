/**
 * 공통코드 규칙. 클라이언트 폼과 Convex 함수가 같이 쓴다.
 * 그룹(예: 출석 메모) 아래에 코드(예: 지각, 조퇴)를 두고, 화면은 그룹 키로 코드를 찾아 쓴다.
 */

/** 화면이 키로 직접 쓰는 그룹. 삭제·키 변경을 막고, 없으면 기본 코드와 함께 만든다. */
export const SYSTEM_GROUPS = [
  {
    key: "CHECK_MEMO",
    name: "출석 메모",
    description: "출석체크 카드 아래 메모 칸에서 고르는 코드",
    codes: ["지각", "조퇴", "결석 연락함", "연락 안 됨", "차량 동승", "식사 안 함"],
  },
] as const;

export const CHECK_MEMO = "CHECK_MEMO";
export const isSystemGroup = (key: string) => SYSTEM_GROUPS.some((g) => g.key === key);

export const MAX_LABEL = 30;
export const MAX_MEMO_TEXT = 200;

export const MSG_KEY = "그룹 키는 영문 대문자로 시작하고 영문 대문자·숫자·_ 2~30자로 입력하세요. (예: CHECK_MEMO)";
export const MSG_GROUP_NAME = "그룹 이름을 입력하세요.";
export const MSG_LABEL = `코드 이름을 입력하세요. (${MAX_LABEL}자 이내)`;
export const MSG_SYSTEM = "화면에서 쓰는 기본 그룹이라 지우거나 키를 바꿀 수 없어요. 코드만 고쳐 쓰세요.";

/** 그룹 키 정리: 대문자로 바꾸고 공백·하이픈은 _로 */
export const normalizeKey = (s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_");
export const isKey = (s: string) => /^[A-Z][A-Z0-9_]{1,29}$/.test(s);

/** 코드 이름 정리: 앞뒤 공백 제거, 비었거나 너무 길면 null */
export function cleanLabel(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t && t.length <= MAX_LABEL ? t : null;
}
