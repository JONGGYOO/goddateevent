"use client";

import { forwardRef, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { splitMatch } from "@/lib/hangul";

export type G = "M" | "F";
export type GFilter = "ALL" | G;
export const GN = (g: G) => (g === "M" ? "형제" : "자매");

/* ---------- 시트(모달) : shadcn Dialog 위에 프로토타입 시트 모양 ---------- */
export function Modal({
  open,
  onClose,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "sheet flex flex-col gap-3.5 w-[calc(100%-2rem)] max-h-[90dvh] overflow-auto rounded-[18px] p-5 text-[15px] ring-0 shadow-[0_10px_40px_rgba(0,0,0,.25)] bg-[var(--surface)] text-[var(--ink)]",
          wide ? "max-w-[900px] sm:max-w-[900px]" : "max-w-[560px] sm:max-w-[560px]",
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return (
    <DialogTitle className="m-0 flex flex-wrap items-center gap-2.5 font-sans text-[22px] leading-tight font-bold">
      {children}
    </DialogTitle>
  );
}

/* ---------- 하이라이트 ---------- */
export function Hl({ text, q }: { text: string; q: string }) {
  const parts = splitMatch(text, q);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark>{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

/* ---------- 세그먼트 버튼 ---------- */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const G_OPTIONS = [
  ["ALL", "전체"],
  ["M", "남"],
  ["F", "여"],
] as const;

/* ---------- 검색창 ---------- */
export const SearchBox = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    big?: boolean;
    numeric?: boolean;
    onEnter?: () => void;
  }
>(function SearchBox({ value, onChange, placeholder, big, numeric, onEnter }, ref) {
  const inner = useRef<HTMLInputElement | null>(null);
  return (
    <label className={cn("search", big && "big")}>
      <input
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        type="search"
        autoComplete="off"
        inputMode={numeric ? "numeric" : undefined}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      {value && (
        <button
          className="clear"
          type="button"
          aria-label="지우기"
          onClick={() => {
            onChange("");
            inner.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </label>
  );
});

/* ---------- 성별 선택 ---------- */
export function GenderPicker({ value, onChange }: { value: G; onChange: (g: G) => void }) {
  return (
    <div className="gender">
      {(["M", "F"] as const).map((g) => (
        <button key={g} type="button" className={g} aria-pressed={value === g} onClick={() => onChange(g)}>
          {g === "M" ? "형제(남)" : "자매(여)"}
        </button>
      ))}
    </div>
  );
}

/* ---------- 차량번호 두 칸 입력 ---------- */
export function PlateFields({
  front,
  back,
  onFront,
  onBack,
  onEnter,
  addLabel,
  onAdd,
  autoFocus,
}: {
  front: string;
  back: string;
  onFront: (v: string) => void;
  onBack: (v: string) => void;
  onEnter?: () => void;
  addLabel?: string;
  onAdd?: () => void;
  autoFocus?: boolean;
}) {
  const backRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("plateIn", onAdd && "add")}>
      <input
        autoComplete="off"
        maxLength={4}
        placeholder="19저"
        aria-label="차량번호 앞자리"
        value={front}
        autoFocus={autoFocus}
        onChange={(e) => onFront(e.target.value.replace(/\s/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            backRef.current?.focus();
          }
        }}
      />
      <input
        ref={backRef}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="2074"
        aria-label="차량번호 뒷 4자리"
        value={back}
        onChange={(e) => onBack(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (onEnter || onAdd)) {
            e.preventDefault();
            (onEnter ?? onAdd)?.();
          }
        }}
      />
      {onAdd && (
        <button className="btn ghost" type="button" onClick={onAdd}>
          {addLabel ?? "추가"}
        </button>
      )}
    </div>
  );
}

/* ---------- 요약 카드 ---------- */
export function Stat({
  label,
  value,
  total,
  unit,
  ratio,
  g,
}: {
  label: string;
  value: ReactNode;
  total?: ReactNode;
  unit?: string;
  ratio?: number | null;
  g?: G;
}) {
  return (
    <div className={cn("stat", g)}>
      <div className="row">
        <span className="lbl">{label}</span>
        <span className="val num">
          {value}
          {total !== undefined && <small>/{total}</small>}
          {unit && <small>{unit}</small>}
        </span>
      </div>
      {ratio !== undefined && (
        <div className="bar">
          <i style={{ width: `${Math.max(0, Math.min(1, ratio ?? 0)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export const pct = (x: number | null) => (x == null ? "-" : `${Math.round(x * 100)}%`);

export function Meter({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="muted">-</span>;
  return (
    <span className="rate">
      <span className="bar">
        <i style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="num">{pct(ratio)}</span>
    </span>
  );
}

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="empty flat" aria-busy="true">
      <span className="hint">{label}</span>
    </div>
  );
}

/** 이름별 인원 수 (동명이인 표시용) */
export function countNames(names: string[]) {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return m;
}
