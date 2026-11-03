// 휴대폰: 010 + 8자리 → "010-1234-5678"
export const MSG_PHONE = "010으로 시작하는 11자리 번호로 입력하세요. 비워 둬도 됩니다.";

export function normalizePhone(s: string | null | undefined): string | null {
  const d = String(s ?? "").replace(/\D/g, "");
  return /^010\d{8}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : null;
}

/** 가운데 4자리 마스킹: 010-****-5678 */
export const maskPhone = (p: string) => p.replace(/-(\d{4})-/, "-****-");

export const phoneTail = (p: string | undefined) => (p ? p.slice(-4) : "");
