import { hungarian } from "./hungarian";

export type Gender = "M" | "F";
export type Person = { id: string; gender: Gender };
/** 사람 id → 조 번호(0부터). 미배정은 null 또는 키 없음 */
export type Assign = Record<string, number | null | undefined>;
export type PriorGrouping = { no: number; assign: Assign };
export type GroupMode = "all" | "fixM" | "fixF";
/** "a|b" → 같은 조였던 회차 번호 목록 */
export type MetMap = Map<string, number[]>;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 이전 회차 편성들 → 같은 조였던 쌍 맵 */
export function buildMet(priors: PriorGrouping[]): MetMap {
  const met: MetMap = new Map();
  for (const { no, assign } of priors) {
    const byGroup = new Map<number, string[]>();
    for (const [id, g] of Object.entries(assign)) {
      if (g == null) continue;
      const list = byGroup.get(g);
      if (list) list.push(id);
      else byGroup.set(g, [id]);
    }
    for (const m of byGroup.values()) {
      for (let i = 0; i < m.length; i++)
        for (let j = i + 1; j < m.length; j++) {
          const k = pairKey(m[i], m[j]);
          const list = met.get(k);
          if (list) list.push(no);
          else met.set(k, [no]);
        }
    }
  }
  return met;
}

/** 배정 → 조별 id 목록 (k 이상 조 번호는 미배정 취급) */
export function groupsOf(assign: Assign, ids: string[], k: number): string[][] {
  const g: string[][] = Array.from({ length: k }, () => []);
  for (const id of ids) {
    const x = assign[id];
    if (x != null && x >= 0 && x < k) g[x].push(id);
  }
  return g;
}

export const isAssigned = (assign: Assign, id: string, k: number) => {
  const x = assign[id];
  return x != null && x >= 0 && x < k;
};

export type GroupingScore = { mixedPairs: number; samePairs: number; unassigned: number; cost: number };

/** 현재 편성 점수: 이성 재회 쌍 수, 동성 재회 쌍 수, 미배정 수 */
export function scoreGrouping(people: Person[], k: number, assign: Assign, met: MetMap): GroupingScore {
  const G = new Map(people.map((p) => [p.id, p.gender]));
  const ids = people.map((p) => p.id);
  let mixedPairs = 0;
  let samePairs = 0;
  let cost = 0;
  for (const m of groupsOf(assign, ids, k)) {
    for (let i = 0; i < m.length; i++)
      for (let j = i + 1; j < m.length; j++) {
        const list = met.get(pairKey(m[i], m[j]));
        if (!list) continue;
        if (G.get(m[i]) !== G.get(m[j])) {
          mixedPairs++;
          cost += 10 * list.length;
        } else {
          samePairs++;
          cost += list.length;
        }
      }
  }
  const unassigned = ids.filter((id) => !isAssigned(assign, id, k)).length;
  return { mixedPairs, samePairs, unassigned, cost };
}

export type SolveInput = {
  people: Person[];
  k: number;
  met: MetMap;
  mode: GroupMode;
  base: Assign;
  avoid: boolean;
  rng?: Rng;
};

/**
 * 조 편성.
 * - all: 남녀 모두 다시 배정
 * - fixM/fixF: 고정 성별은 현재 조 유지(미배정자는 그 성별이 적은 조부터), 나머지 성별만 재배정
 * - avoid: 이전 회차에 만난 쌍(이성 10, 동성 1 × 횟수)을 최소화
 */
export function solveGroups({ people, k, met, mode, base, avoid, rng = Math.random }: SolveInput): Record<string, number> {
  const G = new Map(people.map((p) => [p.id, p.gender]));
  const gen = (id: string) => G.get(id) as Gender;
  const ids = people.map((p) => p.id);
  const W = (a: string, b: string) => {
    const m = met.get(pairKey(a, b));
    return m ? (gen(a) !== gen(b) ? 10 : 1) * m.length : 0;
  };
  const randG: Gender[] = mode === "all" ? ["M", "F"] : mode === "fixM" ? ["F"] : ["M"];
  const fixG: Gender | null = mode === "fixM" ? "M" : mode === "fixF" ? "F" : null;

  // 고정 성별만 현재 배정을 유지
  const a: Record<string, number | null> = {};
  for (const id of ids) {
    const x = base[id];
    a[id] = x != null && x >= 0 && x < k && !randG.includes(gen(id)) ? x : null;
  }
  if (fixG) {
    const cnt = new Array<number>(k).fill(0);
    for (const id of ids) if (gen(id) === fixG && a[id] != null) cnt[a[id] as number]++;
    for (const id of shuffle(
      ids.filter((x) => gen(x) === fixG && a[x] == null),
      rng,
    )) {
      const mn = Math.min(...cnt);
      const c = shuffle(
        cnt.map((v, i) => (v === mn ? i : -1)).filter((i) => i >= 0),
        rng,
      )[0];
      a[id] = c;
      cnt[c]++;
    }
  }

  // 성별별 조 정원
  const slots = new Map<Gender, number[]>();
  randG.forEach((g, gi) => {
    const n = ids.filter((id) => gen(id) === g).length;
    const per = Math.floor(n / k);
    const extra = n % k;
    const other = new Array<number>(k).fill(0);
    for (const id of ids) if (gen(id) !== g && a[id] != null) other[a[id] as number]++;
    let order = [...Array(k).keys()];
    order = fixG ? shuffle(order, rng).sort((x, y) => other[x] - other[y]) : gi === 0 ? order : order.reverse();
    const sz = new Array<number>(k).fill(per);
    order.slice(0, extra).forEach((i) => sz[i]++);
    slots.set(g, sz);
  });

  const R = ids.filter((id) => randG.includes(gen(id)));
  const fill = (): Record<string, number> => {
    const b: Record<string, number | null> = { ...a };
    for (const g of randG) {
      const r = shuffle(
        R.filter((id) => gen(id) === g),
        rng,
      );
      let i = 0;
      (slots.get(g) ?? []).forEach((s, gi) => {
        for (let t = 0; t < s; t++) b[r[i++]] = gi;
      });
    }
    return b as Record<string, number>;
  };
  if (!avoid) return fill();

  const cost = (b: Assign) => {
    let c = 0;
    for (const m of groupsOf(b, ids, k))
      for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) c += W(m[i], m[j]);
    return c;
  };

  const reassign = (b: Record<string, number>, g: Gender) => {
    const rs = R.filter((id) => gen(id) === g);
    if (!rs.length) return;
    const slotG: number[] = [];
    (slots.get(g) ?? []).forEach((sz, gi) => {
      for (let t = 0; t < sz; t++) slotG.push(gi);
    });
    const gm = groupsOf(b, ids, k);
    const C = rs.map((id) =>
      slotG.map((gi) => gm[gi].reduce((s, y) => (gen(y) !== g ? s + W(id, y) : s), 0) + rng() * 0.01),
    );
    const asg = hungarian(C);
    rs.forEach((id, i) => {
      b[id] = slotG[asg[i]];
    });
  };

  let best: Record<string, number> | null = null;
  let bestC = Infinity;
  for (let r = 0; r < 20 && bestC > 0; r++) {
    const b = fill();
    for (let it = 0; it < (randG.length > 1 ? 8 : 1); it++) for (const g of shuffle([...randG], rng)) reassign(b, g);

    // 같은 성별 두 명 맞바꾸기 로컬 서치
    const gm = groupsOf(b, ids, k);
    const c = (x: string, g: number, ex: string) => gm[g].reduce((s, y) => (y === x || y === ex ? s : s + W(x, y)), 0);
    let improved = true;
    let pass = 0;
    while (improved && pass++ < 40) {
      improved = false;
      const o = shuffle([...R], rng);
      for (let i = 0; i < o.length; i++)
        for (let j = i + 1; j < o.length; j++) {
          const x = o[i];
          const y = o[j];
          if (gen(x) !== gen(y)) continue;
          const gx = b[x];
          const gy = b[y];
          if (gx === gy) continue;
          const d = c(x, gy, y) + c(y, gx, x) - c(x, gx, x) - c(y, gy, y);
          if (d < 0) {
            b[x] = gy;
            b[y] = gx;
            gm[gx].splice(gm[gx].indexOf(x), 1, y);
            gm[gy].splice(gm[gy].indexOf(y), 1, x);
            improved = true;
          }
        }
    }
    const cc = cost(b);
    if (cc < bestC) {
      bestC = cc;
      best = b;
    }
  }
  return best ?? fill();
}

/** 조 개수 기본값: 참여자 10명당 1조, 2~8 */
export const defaultGroupCount = (n: number) => Math.max(2, Math.min(8, Math.round(n / 10) || 4));
