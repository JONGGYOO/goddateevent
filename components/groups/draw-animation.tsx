"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 조 편성 다시 보기 애니메이션 (draw-animation.html 이식).
 * 결과(어느 조인지)를 먼저 정해 두고, 공의 경로를 그 조 칸에 정확히 떨어지도록 역산한다.
 * 핀을 만날 때마다 왼쪽/오른쪽으로 한 칸(갈톤 보드). 색은 CSS 토큰에서 읽어 라이트/다크 모두 대응.
 */
export type DrawPerson = { name: string; g: "M" | "F" };

type Pt = { x: number; y: number };
type Seg = { d: number; flash?: [number, number]; f: (p: number) => Pt };
type Ball = { id: string; gi: number; slot: number; start: number; persist: number; amp: number; ts: number[]; segs: Seg[]; tot: number };
type Tag = { id: string; gi: number; slot: number };
type Layout = {
  W: number;
  H: number;
  binW: number;
  h: number;
  br: number;
  top: number;
  binTop: number;
  rowGap: number;
  binBottom: number;
  tagH: number;
  c0: number;
  peg: number;
};

// GAP: 공 투입 간격, TD: 첫 낙하, TH: 핀 한 칸 이동, TL: 칸 안착 (ms, 1배속 기준)
const GAP = 260;
const TD = 380;
const TH = 150;
const TL = 320;
const SPEEDS = [0.5, 1, 2, 4] as const;

const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export function DrawAnimation({
  people,
  k,
  assign,
  title,
  onClose,
}: {
  people: Record<string, DrawPerson>;
  k: number;
  assign: Record<string, number | null | undefined>;
  title: string;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(1);
  const skipRef = useRef<() => void>(() => {});
  const [speed, setSpeed] = useState(1);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState("");

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const cv = cvRef.current;
    const stage = stageRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !stage || !ctx) return;

    const cs = getComputedStyle(document.documentElement);
    const tk = (n: string) => cs.getPropertyValue(n).trim();
    const C = {
      peg: tk("--line"),
      hit: tk("--brand"),
      ink: tk("--ink"),
      M: tk("--male"),
      F: tk("--female"),
      Ms: tk("--male-soft"),
      Fs: tk("--female-soft"),
      surf: tk("--surface"),
    };
    const FONT = tk("--f-body") || "sans-serif";
    let R = 8;

    const ids = Object.keys(assign).filter((id) => people[id] && assign[id] != null && (assign[id] as number) >= 0 && (assign[id] as number) < k);
    const fill = new Array<number>(k).fill(0);
    const tags: Tag[] = [];
    const balls: Ball[] = shuffle([...ids]).map((id, i) => {
      const gi = assign[id] as number;
      return {
        id,
        gi,
        slot: fill[gi]++,
        start: i * GAP + Math.random() * 90, // 투입 리듬을 살짝 흔듦
        persist: rnd(0.1, 0.45), // 같은 방향으로 계속 가려는 관성
        amp: rnd(8, 20) * (Math.random() < 0.5 ? -1 : 1),
        ts: [],
        segs: [],
        tot: 0,
      };
    });
    const maxCount = Math.max(1, ...fill);
    const total = ids.length;
    const D = { T: 0, last: null as number | null, raf: 0, done: false, L: null as Layout | null, flash: new Map<string, number>(), endAll: 0 };
    const slotY = (j: number) => (D.L as Layout).binBottom - (j + 0.5) * ((D.L as Layout).tagH + 3);

    /** 보드 배치 + 공 경로 계산 (창 크기가 바뀌면 다시) */
    function layout() {
      const dpr = window.devicePixelRatio || 1;
      const W = stage!.clientWidth;
      const H = stage!.clientHeight;
      cv!.width = Math.round(W * dpr);
      cv!.height = Math.round(H * dpr);
      cv!.style.width = `${W}px`;
      cv!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const binW = W / k;
      const binBottom = H - 30;
      const binH = Math.max(110, Math.min(H * 0.36, maxCount * 17 + 24));
      const binTop = binBottom - binH;
      const top = 44;

      // 줄 수: 줄 간격 약 24px 이상 (짝수, 8~26줄)
      R = Math.max(8, Math.min(26, 2 * Math.floor((binTop - top - 16) / 24 / 2)));
      const rowGap = (binTop - top - 16) / R;

      // 칸 간격 h = 조 너비 / n (n 짝수). 맨 왼쪽에서 맨 오른쪽 조 중심까지 R걸음 안에 닿는 가장 촘촘한 n
      let n = 2;
      for (let c = 2 * Math.floor(binW / (2 * 30)); c >= 2; c -= 2) {
        const hh = binW / c;
        const brr = Math.min(30, hh * 0.9);
        const t0 = Math.ceil((brr - binW / 2) / hh);
        if ((k - 1) * c - t0 <= R) {
          n = c;
          break;
        }
      }
      const h = binW / n;
      const br = Math.max(16, Math.min(30, h * 0.9, rowGap * 1.3)); // 공 반지름 (이름이 잘 읽히게)
      const c0 = binW / 2;
      const tb0 = Math.ceil((br - c0) / h);
      const tb1 = Math.floor((W - br - c0) / h);
      const tagH = Math.max(11, Math.min(22, (binBottom - binTop - 8) / maxCount - 3));
      D.L = { W, H, binW, h, br, top, binTop, rowGap, binBottom, tagH, c0, peg: Math.max(2.5, Math.min(4, h * 0.12)) };
      const L = D.L;

      balls.forEach((b) => {
        const ti = b.gi * n; // 목표 조 중심의 격자 인덱스 (짝수)
        // 시작 칸: 목표에 R걸음 안에 닿을 수 있는 범위에서 고르게. 줄 0의 핀은 짝수 칸
        const lo = Math.max(tb0, ti - R);
        const hi = Math.min(tb1, ti + R);
        let t0 = ri(lo, hi);
        if (((t0 % 2) + 2) % 2) t0 += t0 + 1 <= hi ? 1 : -1;

        // 한 칸씩 랜덤 워크: 브리지 확률 (남은걸음+남은거리)/(2×남은걸음) + 관성
        const ts = [t0];
        let t = t0;
        let prev = Math.random() < 0.5 ? -1 : 1;
        for (let r = 0; r < R; r++) {
          const m = R - r;
          const Dd = ti - t;
          let pp = (m + Dd) / (2 * m);
          if (Math.abs(Dd) < m) pp = pp * (1 - b.persist) + (prev > 0 ? 1 : 0) * b.persist;
          if (t + 1 > tb1) pp = 0;
          if (t - 1 < tb0) pp = 1; // 벽에서는 안쪽으로
          const st = Math.random() < pp ? 1 : -1;
          t += st;
          prev = st;
          ts.push(t);
        }
        if (t !== ti) {
          // 드물게 벽 때문에 어긋나면 관성 없이 다시
          t = t0;
          ts.length = 1;
          for (let r = 0; r < R; r++) {
            const m = R - r;
            const Dd = ti - t;
            const st = Dd >= m ? 1 : Dd <= -m ? -1 : Math.random() < (m + Dd) / (2 * m) ? 1 : -1;
            t += st;
            ts.push(t);
          }
        }
        b.ts = ts;

        // 구간: 첫 낙하 → 핀마다 한 칸 이동 → 칸 안착
        const X = (i: number) => c0 + b.ts[i] * h;
        const cy = (r: number) => top + rowGap * (r + 0.5) - L.peg - br + 1;
        const segs: Seg[] = [];
        segs.push({ d: TD, f: (p) => ({ x: X(0), y: -br + (cy(0) + br) * p * p }) });
        for (let r = 0; r < R; r++) {
          const xa = X(r);
          const xb = X(r + 1);
          const ya = cy(r);
          const yb = r + 1 < R ? cy(r + 1) : binTop - br;
          const hk = rnd(0.3, 0.55);
          const d = TH * rnd(0.92, 1.12);
          segs.push({
            d,
            flash: [r, b.ts[r]],
            f: (p) => ({
              x: xa + (xb - xa) * (0.5 - 0.5 * Math.cos(Math.PI * p)), // 부드러운 좌우 이동
              y: ya + (yb - ya) * p * p - rowGap * hk * Math.sin(Math.PI * p) * (1 - p * 0.4), // 낮은 포물선
            }),
          });
        }
        const xl = X(R);
        const yl = binTop - br;
        const amp = Math.sign(b.amp) * Math.min(binW * 0.06, 5);
        segs.push({ d: TL, f: (p) => ({ x: xl + amp * (1 - p) * Math.sin(p * Math.PI * 2), y: yl + (slotY(b.slot) - yl) * p * p }) });
        b.segs = segs;
        b.tot = segs.reduce((a, s) => a + s.d, 0);
      });
      D.endAll = balls.reduce((m, b) => Math.max(m, b.start + b.tot), 0);
    }

    /** 현재 시각의 공 위치 (null = 아직 안 나옴, "landed" = 칸에 들어감) */
    function ballPos(b: Ball): Pt | null | "landed" {
      let u = D.T - b.start;
      if (u < 0) return null;
      for (const sg of b.segs) {
        if (u < sg.d) {
          const p = u / sg.d;
          if (sg.flash && p < 0.3) D.flash.set(`${sg.flash[0]}:${sg.flash[1]}`, D.T);
          return sg.f(p);
        }
        u -= sg.d;
      }
      return "landed";
    }

    function rr(x: number, y: number, w: number, hh: number, r: number) {
      ctx!.beginPath();
      ctx!.moveTo(x + r, y);
      ctx!.arcTo(x + w, y, x + w, y + hh, r);
      ctx!.arcTo(x + w, y + hh, x, y + hh, r);
      ctx!.arcTo(x, y + hh, x, y, r);
      ctx!.arcTo(x, y, x + w, y, r);
      ctx!.closePath();
    }

    let lastCount = "";
    function draw() {
      const L = D.L as Layout;
      const c = ctx!;
      c.clearRect(0, 0, L.W, L.H);
      const placed: (Tag | Ball)[] = [...tags];
      const moving: { b: Ball; p: Pt }[] = [];
      balls.forEach((b) => {
        const p = ballPos(b);
        if (p === "landed") placed.push(b);
        else if (p) moving.push({ b, p });
      });

      // 핀: 줄 r에는 격자 인덱스 짝홀이 r과 같은 자리. 공이 닿은 핀은 잠깐 강조
      const PG = L.peg;
      const tmin = Math.ceil((PG + 2 - L.c0) / L.h);
      const tmax = Math.floor((L.W - PG - 2 - L.c0) / L.h);
      for (let r = 0; r < R; r++) {
        const y = L.top + L.rowGap * (r + 0.5);
        for (let t = tmin; t <= tmax; t++) {
          if ((((t - r) % 2) + 2) % 2) continue;
          const f = D.flash.get(`${r}:${t}`);
          const hot = f != null && D.T - f < 220 * speedRef.current;
          c.beginPath();
          c.arc(L.c0 + t * L.h, y, hot ? PG + 2.5 : PG, 0, Math.PI * 2);
          c.fillStyle = hot ? C.hit : C.peg;
          c.fill();
        }
      }

      // 조 칸 + 라벨
      const cnt = new Array<number>(k).fill(0);
      placed.forEach((x) => cnt[x.gi]++);
      c.strokeStyle = C.peg;
      c.lineWidth = 2;
      for (let i = 0; i <= k; i++) {
        const x = Math.min(L.W - 1, Math.max(1, i * L.binW));
        c.beginPath();
        c.moveTo(x, L.binTop);
        c.lineTo(x, L.binBottom);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(0, L.binBottom);
      c.lineTo(L.W, L.binBottom);
      c.stroke();
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (let i = 0; i < k; i++) {
        c.fillStyle = C.ink;
        c.font = `700 ${L.binW < 80 ? 12 : 15}px ${FONT}`;
        c.fillText(L.binW < 80 ? `${i + 1}조 ${cnt[i]}` : `${i + 1}조 · ${cnt[i]}명`, (i + 0.5) * L.binW, L.H - 14);
      }

      // 칸에 들어간 사람: 이름 태그로 아래부터 쌓임
      placed.forEach((x) => {
        const m = people[x.id];
        const w = Math.min(L.binW - 10, 130);
        const y = slotY(x.slot);
        const cx = (x.gi + 0.5) * L.binW;
        rr(cx - w / 2, y - L.tagH / 2, w, L.tagH, 6);
        c.fillStyle = m.g === "M" ? C.Ms : C.Fs;
        c.fill();
        c.fillStyle = m.g === "M" ? C.M : C.F;
        c.font = `600 ${Math.min(13, L.tagH - 3)}px ${FONT}`;
        c.fillText(m.name, cx, y + 0.5);
      });

      // 떨어지는 공: 형제 파랑 / 자매 분홍
      moving.forEach(({ b, p }) => {
        const m = people[b.id];
        c.beginPath();
        c.arc(p.x, p.y, L.br, 0, Math.PI * 2);
        c.fillStyle = m.g === "M" ? C.M : C.F;
        c.fill();
        c.lineWidth = 2.5;
        c.strokeStyle = C.surf;
        c.stroke();
        const fs = Math.max(10, Math.min(18, (L.br * 2 - 8) / Math.max(2, m.name.length)));
        c.font = `700 ${fs}px ${FONT}`;
        c.fillStyle = C.surf;
        c.fillText(m.name, p.x, p.y + 0.5);
      });
      const label = `${placed.length}/${total}명`;
      if (label !== lastCount) {
        lastCount = label;
        setCount(label);
      }
    }

    function finish() {
      if (D.done) return;
      D.done = true;
      setDone(true);
    }
    function frame(now: number) {
      if (D.last == null) D.last = now;
      const dt = Math.min(64, now - D.last);
      D.last = now;
      D.T += dt * speedRef.current;
      if (D.T >= D.endAll) finish();
      draw();
      if (!D.done) D.raf = requestAnimationFrame(frame);
    }
    skipRef.current = () => {
      cancelAnimationFrame(D.raf);
      D.T = D.endAll + 1e7;
      finish();
      draw();
    };
    const onResize = () => {
      layout();
      draw();
    };

    layout();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) skipRef.current();
    else {
      draw();
      D.raf = requestAnimationFrame(frame);
    }
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(D.raf);
      removeEventListener("resize", onResize);
    };
  }, [people, k, assign]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="drawov" role="dialog" aria-modal="true" aria-labelledby="drawTitle">
      <div className="drawbar">
        <strong id="drawTitle">{title}</strong>
        <span className="hint num">{count}</span>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="재생 속도">
          {SPEEDS.map((sp) => (
            <button key={sp} type="button" aria-pressed={speed === sp} onClick={() => setSpeed(sp)}>
              {sp}배속
            </button>
          ))}
        </div>
        {!done && (
          <button className="btn ghost" type="button" onClick={() => skipRef.current()}>
            건너뛰기
          </button>
        )}
        <button className="btn" type="button" onClick={onClose}>
          {done ? "결과 보기" : "닫기"}
        </button>
      </div>
      <div className="drawstage" ref={stageRef}>
        <canvas ref={cvRef} aria-label="이름 공이 핀을 지나 조 칸으로 떨어지는 애니메이션" />
      </div>
    </div>
  );
}
