import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { gender, logKind } from "./schema";
import { MAX_ROWS } from "./lib/data";
import { todaySeoul } from "../lib/date";
import { SYSTEM_GROUPS } from "../lib/codes";
import { buildMet, defaultGroupCount, solveGroups, type PriorGrouping } from "../lib/grouping";

/**
 * 개발용 예시 데이터 (회원 53명, 제1~3회 행사, 회차·참여자·조 편성·출석).
 * 운영 배포에서 실행 금지. 실행: npx convex run seed:run '{"reset":true}'
 * 조 편성 최적화가 무거워서 계산은 action에서 하고, 저장만 mutation으로 나눠 한다.
 */
const MN = ["김민수", "김민수", "이준호", "박성진", "최영훈", "정우성", "강다니엘", "조현우", "윤재석", "장태민", "임하늘", "한승우", "오세진", "서지훈", "신동혁", "권요셉", "황바울", "안성민", "송현석", "전다윗", "홍길준", "유상현", "고민석", "문태양", "배진우", "노한결", "하은찬"];
const FN = ["김지은", "이은혜", "박소망", "최하은", "정예린", "강수아", "조은비", "윤서연", "장미래", "임사랑", "한지혜", "오유진", "서은총", "신예은", "권한나", "황다은", "안소희", "송민지", "전기쁨", "홍주희", "유나래", "고은솔", "문가은", "배수정", "김지은", "백시온"];
const CH = ["은혜교회", "새소망교회", "빛과소금교회", "주님의교회", "한빛교회", "생명샘교회", "새생명교회", ""];
const CARS = ["12가 3456", "45나 7812", "123다 4567", "67라 9021", "301마 2244", "88바 1357", "27사 8640", "19아 5072", "154자 3318", "62하 7790", "33허 2048", "210거 6601", "71너 9135", "56더 4482", "142러 1209", "90머 7356", "38버 2913", "245서 5508", "14어 8174", "77저 3662", "109고 4920", "52노 1846", "81도 6235", "166로 9472", "23모 3015", "44보 7781", "199소 2369", "68오 5154", "31구 8806"];

const TABLES = ["checkMemos", "codes", "codeGroups", "checkLogs", "carChecks", "attendance", "groupings", "participants", "sessions", "events", "members"] as const;

export const hasData = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("members").first()) !== null,
});

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const t of TABLES) for (const d of await ctx.db.query(t).take(MAX_ROWS)) await ctx.db.delete(t, d._id);
    return null;
  },
});

export const insertCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const g of SYSTEM_GROUPS) {
      const id = await ctx.db.insert("codeGroups", { key: g.key, name: g.name, description: g.description });
      for (const [i, label] of g.codes.entries()) await ctx.db.insert("codes", { groupId: id, label, order: i + 1, active: true });
    }
    return null;
  },
});

export const insertMembers = internalMutation({
  args: {
    members: v.array(
      v.object({ name: v.string(), gender, phone: v.optional(v.string()), church: v.optional(v.string()), cars: v.array(v.string()) }),
    ),
  },
  handler: async (ctx, { members }) => {
    const ids: Id<"members">[] = [];
    for (const m of members) ids.push(await ctx.db.insert("members", m));
    return ids;
  },
});

export const insertEvent = internalMutation({
  args: {
    no: v.number(),
    name: v.string(),
    participants: v.array(v.object({ memberId: v.id("members") })),
    sessions: v.array(
      v.object({
        date: v.string(),
        grouping: v.optional(
          v.object({ groupCount: v.number(), assignments: v.array(v.object({ memberId: v.id("members"), group: v.number() })) }),
        ),
        attendance: v.array(v.object({ memberId: v.id("members"), checkedAt: v.number(), device: v.string() })),
        cars: v.array(v.object({ memberId: v.id("members"), plate: v.string(), checkedAt: v.number(), device: v.string() })),
        logs: v.array(v.object({ memberId: v.id("members"), kind: logKind, device: v.string(), at: v.number() })),
      }),
    ),
  },
  handler: async (ctx, { no, name, participants, sessions }) => {
    const eventId = await ctx.db.insert("events", { no, name });
    for (const p of participants) await ctx.db.insert("participants", { eventId, ...p });
    for (const s of sessions) {
      const sessionId = await ctx.db.insert("sessions", { eventId, date: s.date });
      if (s.grouping) await ctx.db.insert("groupings", { sessionId, ...s.grouping });
      for (const a of s.attendance) await ctx.db.insert("attendance", { sessionId, ...a });
      for (const c of s.cars) await ctx.db.insert("carChecks", { sessionId, ...c });
      for (const l of s.logs) await ctx.db.insert("checkLogs", { sessionId, ...l });
    }
    return eventId;
  },
});

type SeedSession = {
  date: string;
  grouping?: { groupCount: number; assignments: { memberId: Id<"members">; group: number }[] };
  attendance: { memberId: Id<"members">; checkedAt: number; device: string }[];
  cars: { memberId: Id<"members">; plate: string; checkedAt: number; device: string }[];
  logs: { memberId: Id<"members">; kind: "in" | "car"; device: string; at: number }[];
};

export const run = internalAction({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    if ((await ctx.runQuery(internal.seed.hasData, {})) && !reset) {
      throw new ConvexError('이미 데이터가 있어요. 지우고 다시 넣으려면 {"reset":true}로 실행하세요.');
    }
    await ctx.runMutation(internal.seed.clearAll, {});
    await ctx.runMutation(internal.seed.insertCodes, {});

    let r = 11;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const ri = (n: number) => Math.floor(rnd() * n);
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = todaySeoul();

    let ci = 0;
    const rows = [...MN.map((name) => ({ name, gender: "M" as const })), ...FN.map((name) => ({ name, gender: "F" as const }))].map(
      (x) => {
        const cars: string[] = [];
        if (ri(10) < 6 && ci < CARS.length) cars.push(CARS[ci++]);
        return {
          ...x,
          phone: ri(10) < 8 ? `010-${2000 + ri(7999)}-${pad(ri(100))}${pad(ri(100))}` : undefined,
          church: CH[ri(CH.length)] || undefined,
          cars,
        };
      },
    );
    const ids: Id<"members">[] = await ctx.runMutation(internal.seed.insertMembers, { members: rows });
    const carsOf = new Map(ids.map((id, i) => [id, rows[i].cars]));
    const M = ids.filter((_, i) => rows[i].gender === "M");
    const F = ids.filter((_, i) => rows[i].gender === "F");

    const ev = async (no: number, name: string, dates: string[], mi: Id<"members">[], fi: Id<"members">[]) => {
      const people = [...mi.map((id) => ({ id, gender: "M" as const })), ...fi.map((id) => ({ id, gender: "F" as const }))];
      const participants = [
        ...mi.map((memberId) => ({ memberId })),
        ...fi.map((memberId) => ({ memberId })),
      ];
      const k = people.length >= 40 ? 5 : defaultGroupCount(people.length);
      const priors: PriorGrouping[] = [];
      const sessions: SeedSession[] = [];
      for (const [i, date] of dates.entries()) {
        const sno = i + 1;
        const past = date < today;
        const s: SeedSession = { date, attendance: [], cars: [], logs: [] };
        if (past || sno === 4) {
          const assign = solveGroups({ people, k, met: buildMet(priors), mode: "all", base: {}, avoid: true, rng: rnd });
          priors.push({ no: sno, assign });
          s.grouping = {
            groupCount: k,
            assignments: Object.entries(assign).map(([memberId, group]) => ({ memberId: memberId as Id<"members">, group })),
          };
        }
        if (past) {
          const [y, mo, d] = date.split("-").map(Number);
          const base = Date.UTC(y, mo - 1, d, 4, 20); // 13:20 KST
          for (const p of people) {
            if (ri(100) >= 88) continue;
            const at = base + ri(45) * 60000;
            const device = ri(2) ? "A" : "B";
            s.attendance.push({ memberId: p.id, checkedAt: at, device });
            s.logs.push({ memberId: p.id, kind: "in", device, at });
            const c = carsOf.get(p.id) ?? [];
            if (c.length && ri(10) < 8) {
              const cat = at - ri(5) * 60000;
              s.cars.push({ memberId: p.id, plate: c[0], checkedAt: cat, device: "A" });
              s.logs.push({ memberId: p.id, kind: "car", device: "A", at: cat });
            }
          }
          s.logs.sort((a, b) => a.at - b.at);
        }
        sessions.push(s);
      }
      await ctx.runMutation(internal.seed.insertEvent, { no, name, participants, sessions });
    };
    await ev(1, "봄 갓데이트", ["2026-03-08", "2026-03-15", "2026-03-22"], M.filter((_, i) => i % 2 === 0).slice(0, 12), F.filter((_, i) => i % 2 === 1).slice(0, 12));
    await ev(2, "여름 갓데이트", ["2026-06-07", "2026-06-14", "2026-06-21", "2026-06-28"], M.slice(6, 26), F.slice(4, 24));
    await ev(3, "가을 갓데이트", ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15"], M.slice(0, 25), F.slice(0, 25));
    return { members: ids.length };
  },
});
