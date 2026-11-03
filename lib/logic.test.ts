import { describe, expect, it } from "vitest";
import { choOf, matchAt, splitMatch, stripCho } from "./hangul";
import { normalizePlate, readPlateFields, validateBack, validateFront } from "./plate";
import { maskPhone, normalizePhone } from "./phone";
import { addDays, fmtSession, hm, todaySeoul } from "./date";
import { buildMet, groupsOf, pairKey, scoreGrouping, solveGroups, type Person } from "./grouping";
import { hungarian } from "./hungarian";
import { signToken, verifyToken, SESSION_TTL_MS } from "./token";
import { parseImport } from "./import";

describe("초성 검색", () => {
  it("완성형 글자의 초성", () => {
    expect(choOf("김")).toBe("ㄱ");
    expect(choOf("수")).toBe("ㅅ");
    expect(choOf("A")).toBe("A");
  });
  it("ㄱㅁㅅ → 김민수", () => {
    expect(matchAt("김민수", "ㄱㅁㅅ")).toBe(0);
    expect(matchAt("고민석", "ㄱㅁㅅ")).toBe(0);
    expect(matchAt("이준호", "ㄱㅁㅅ")).toBe(-1);
  });
  it("혼합 입력 ㄱ민ㅅ, 중간 일치", () => {
    expect(matchAt("김민수", "ㄱ민ㅅ")).toBe(0);
    expect(matchAt("남궁민수", "민수")).toBe(2);
    expect(matchAt("김민수", "ㄱ 민")).toBe(0);
  });
  it("하이라이트 조각", () => {
    expect(splitMatch("남궁민수", "ㅁㅅ")).toEqual(["남궁", "민수", ""]);
    expect(splitMatch("김민수", "")).toBeNull();
  });
  it("자음 제거", () => expect(stripCho("ㄱ김ㅁ")).toBe("김"));
});

describe("차량번호", () => {
  it("정규화", () => {
    expect(normalizePlate("19저2074")).toBe("19저 2074");
    expect(normalizePlate("123가 4567")).toBe("123가 4567");
    expect(normalizePlate("19저20")).toBeNull();
    expect(normalizePlate("1저2074")).toBeNull();
  });
  it("앞/뒤 검증", () => {
    expect(validateFront("19저")).toBe(true);
    expect(validateFront("123가")).toBe(true);
    expect(validateFront("1234가")).toBe(false);
    expect(validateBack("2074")).toBe(true);
    expect(validateBack("207")).toBe(false);
  });
  it("두 칸 입력", () => {
    expect(readPlateFields("19저", "2074", true)).toEqual({ plate: "19저 2074" });
    expect(readPlateFields("", "", false)).toEqual({ plate: null });
    expect(readPlateFields("", "", true).error).toBeTruthy();
    expect(readPlateFields("저19", "2074", true).error).toContain("앞자리");
    expect(readPlateFields("19저", "20", true).error).toContain("뒷자리");
  });
});

describe("휴대폰", () => {
  it("정규화와 마스킹", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("010-1234-5678")).toBe("010-1234-5678");
    expect(normalizePhone("011-1234-5678")).toBeNull();
    expect(normalizePhone("010-123-5678")).toBeNull();
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
  });
});

describe("날짜 (서울)", () => {
  it("요일 표시와 날짜 더하기", () => {
    expect(fmtSession("2026-10-18")).toBe("10.18(일)");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("UTC 15시는 서울 다음 날 0시", () => {
    const t = Date.UTC(2026, 10, 2, 15, 30);
    expect(todaySeoul(t)).toBe("2026-11-03");
    expect(hm(t)).toBe("00:30");
  });
});

describe("헝가리안", () => {
  it("최소 비용 매칭", () => {
    const r = hungarian([
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ]);
    const cost = r.reduce((s, c, i) => s + [[4, 1, 3], [2, 0, 5], [3, 2, 2]][i][c], 0);
    expect(cost).toBe(5);
    expect(new Set(r).size).toBe(3);
  });
});

/** 재현 가능한 난수 */
const seeded = (seed: number) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

function people(m: number, f: number): Person[] {
  return [
    ...Array.from({ length: m }, (_, i) => ({ id: `m${i}`, gender: "M" as const })),
    ...Array.from({ length: f }, (_, i) => ({ id: `f${i}`, gender: "F" as const })),
  ];
}

describe("조 편성", () => {
  it("정원: 모든 사람 배정, 조마다 남녀 고르게", () => {
    const P = people(25, 25);
    const a = solveGroups({ people: P, k: 5, met: new Map(), mode: "all", base: {}, avoid: true, rng: seeded(1) });
    const gs = groupsOf(a, P.map((p) => p.id), 5);
    for (const g of gs) {
      expect(g.filter((id) => id.startsWith("m")).length).toBe(5);
      expect(g.filter((id) => id.startsWith("f")).length).toBe(5);
    }
  });

  it("나머지 인원: 남자 여분은 앞 조, 여자 여분은 뒤 조", () => {
    const P = people(11, 11);
    const a = solveGroups({ people: P, k: 4, met: new Map(), mode: "all", base: {}, avoid: false, rng: seeded(2) });
    const gs = groupsOf(a, P.map((p) => p.id), 4);
    const total = gs.map((g) => g.length);
    expect(total.reduce((x, y) => x + y)).toBe(22);
    expect(Math.max(...total) - Math.min(...total)).toBeLessThanOrEqual(1);
  });

  it("2회차: 1회차에 만난 이성과 겹치지 않게 (25·25·5조)", () => {
    const P = people(25, 25);
    const first = solveGroups({ people: P, k: 5, met: new Map(), mode: "all", base: {}, avoid: true, rng: seeded(3) });
    const met = buildMet([{ no: 1, assign: first }]);
    const second = solveGroups({ people: P, k: 5, met, mode: "all", base: {}, avoid: true, rng: seeded(4) });
    expect(scoreGrouping(P, 5, second, met).mixedPairs).toBe(0);
  });

  it("남자 고정 모드: 남자 배정은 그대로", () => {
    const P = people(10, 10);
    const base = solveGroups({ people: P, k: 2, met: new Map(), mode: "all", base: {}, avoid: false, rng: seeded(5) });
    const met = buildMet([{ no: 1, assign: base }]);
    const next = solveGroups({ people: P, k: 2, met, mode: "fixM", base, avoid: true, rng: seeded(6) });
    for (const p of P) if (p.gender === "M") expect(next[p.id]).toBe(base[p.id]);
  });

  it("남자 고정 모드: 미배정 남자는 남자가 적은 조로", () => {
    const P = people(4, 4);
    const base = { m0: 0, m1: 0, m2: 0 };
    const next = solveGroups({ people: P, k: 2, met: new Map(), mode: "fixM", base, avoid: false, rng: seeded(7) });
    expect(next.m3).toBe(1);
  });

  it("점수: 이성 재회 쌍과 미배정 수", () => {
    const P = people(2, 2);
    const met = buildMet([{ no: 1, assign: { m0: 0, f0: 0, m1: 1, f1: 1 } }]);
    const s = scoreGrouping(P, 2, { m0: 0, f0: 0, m1: 1 }, met);
    expect(s.mixedPairs).toBe(1);
    expect(s.unassigned).toBe(1);
    expect(met.get(pairKey("f0", "m0"))).toEqual([1]);
  });
});

describe("세션 토큰", () => {
  it("서명·검증·만료·위조", async () => {
    const now = Date.now();
    const t = await signToken("secret-1234567890-abcdefghijklmnop", now);
    expect(await verifyToken("secret-1234567890-abcdefghijklmnop", t, now)).toBe(true);
    expect(await verifyToken("other-secret", t, now)).toBe(false);
    expect(await verifyToken("secret-1234567890-abcdefghijklmnop", t, now + SESSION_TTL_MS + 1)).toBe(false);
    const [p, s] = t.split(".");
    expect(await verifyToken("secret-1234567890-abcdefghijklmnop", `${p}x.${s}`, now)).toBe(false);
    expect(await verifyToken(undefined, t, now)).toBe(false);
    expect(await verifyToken("secret", "", now)).toBe(false);
  });
});

describe("엑셀 붙여넣기", () => {
  it("헤더 무시, 상태 판정", () => {
    const text = "이름\t성별\t휴대폰\t교회\t차량번호\n도하람\t여\t010-3344-1290\t한빛교회\t52가 1188\n변승리\t남\t01077120934\t\t\n탁요한\t남\t010-7712-0934\t\t\n성다솜\t\t\t\t\n이사무엘\t남\t\t\t19저20";
    const rows = parseImport(text, new Set(), new Set(["12가 3456"]));
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "dup", "bad", "bad"]);
    expect(rows[0].plate).toBe("52가 1188");
    expect(rows[1].phoneOk).toBe("010-7712-0934");
    expect(rows[3].errs).toContain("성별은 남/여");
  });
  it("CSV, 기존 번호는 건너뜀", () => {
    const rows = parseImport("김철수,남,010-1111-2222\n박영희,여,,,12가 3456", new Set(["010-1111-2222"]), new Set(["12가 3456"]));
    expect(rows[0].status).toBe("dup");
    expect(rows[1].errs).toContain("차량 중복");
  });
});

describe("추가 조 종류: 남녀 비율 맞추기 (balance=ratio)", () => {
  const mk = (m: number, f: number): Person[] => [
    ...Array.from({ length: m }, (_, i) => ({ id: `m${i}`, gender: "M" as const })),
    ...Array.from({ length: f }, (_, i) => ({ id: `f${i}`, gender: "F" as const })),
  ];
  const diffs = (P: Person[], a: Record<string, number>, k: number) =>
    groupsOf(a, P.map((p) => p.id), k).map((g) => {
      const m = g.filter((id) => id.startsWith("m")).length;
      return Math.abs(m - (g.length - m));
    });

  it("모두 랜덤: 22남 18녀 5조 → 조마다 남녀 차이 1 이하", () => {
    const P = mk(22, 18);
    for (const s of [1, 2, 3]) {
      const a = solveGroups({ people: P, k: 5, met: new Map(), mode: "all", base: {}, avoid: true, balance: "ratio", rng: seeded(s) });
      expect(Math.max(...diffs(P, a, 5))).toBeLessThanOrEqual(1);
      expect(Object.keys(a).length).toBe(40);
    }
  });

  it("남자 고정(치우친 배치)에서 여자를 남자 수에 맞춰 채움", () => {
    const P = mk(20, 20);
    const base: Record<string, number> = {};
    // 남자: 1조 8, 2조 6, 3조 4, 4조 2
    [8, 6, 4, 2].reduce((i, n, g) => {
      for (let t = 0; t < n; t++) base[`m${i + t}`] = g;
      return i + n;
    }, 0);
    const a = solveGroups({ people: P, k: 4, met: new Map(), mode: "fixM", base, avoid: false, balance: "ratio", rng: seeded(9) });
    expect(diffs(P, a, 4)).toEqual([0, 0, 0, 0]);
    for (const id of Object.keys(base)) expect(a[id]).toBe(base[id]);
  });
});
