// 날짜는 "YYYY-MM-DD" (Asia/Seoul), 시각은 epoch ms.
const TZ = "Asia/Seoul";
const WD = "일월화수목금토";

/** 지금 서울 기준 "YYYY-MM-DD" */
export function todaySeoul(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(now),
  );
}

const parse = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "2026-10-18" → "10.18(일)" */
/** "11.14" (회차 칩 둘째 줄용, 요일 없음) */
export function fmtMD(ymd: string): string {
  const d = parse(ymd);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

export function fmtSession(ymd: string): string {
  const d = parse(ymd);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
}

export function addDays(ymd: string, days: number): string {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

const parts = (t: number) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(t));
  const g = (k: string) => f.find((p) => p.type === k)?.value ?? "";
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour") === "24" ? "00" : g("hour"), mi: g("minute") };
};

/** epoch ms → "13:24" (서울) */
export function hm(t: number): string {
  const p = parts(t);
  return `${p.h}:${p.mi}`;
}

/** epoch ms → "2026.03.08" (서울) */
export function fmtDate(t: number): string {
  const p = parts(t);
  return `${p.y}.${p.m}.${p.d}`;
}

export type SessionStatus = "past" | "today" | "future";
export const sessionStatus = (date: string, today: string): SessionStatus =>
  date < today ? "past" : date === today ? "today" : "future";
