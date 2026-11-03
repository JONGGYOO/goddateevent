"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmtSession } from "@/lib/date";

export type Overview = NonNullable<FunctionReturnType<typeof api.events.overview>>;
export type SessionRow = Overview["sessions"][number];

export type EventCtx = {
  eventId: Id<"events">;
  overview: Overview;
  today: string;
  session: SessionRow | null;
  selectSession: (id: Id<"sessions">) => void;
  /** 탭 이동 링크 (현재 회차 유지) */
  hrefFor: (tab: "sessions" | "participants" | "groups" | "check", sessionId?: Id<"sessions">) => string;
};

export const EventContext = createContext<EventCtx | null>(null);

export function useEvent(): EventCtx {
  const c = useContext(EventContext);
  if (!c) throw new Error("행사 상세 레이아웃 밖에서 호출했어요.");
  return c;
}

/** 기본 회차: 오늘 이후 가장 가까운 회차, 없으면 마지막 회차 */
export function defaultSession(sessions: SessionRow[], today: string): SessionRow | null {
  if (!sessions.length) return null;
  return sessions.find((s) => s.date >= today) ?? sessions[sessions.length - 1];
}

export function SessBar() {
  const { overview, session, selectSession, today } = useEvent();
  return (
    <div className="sessbar">
      <span className="hint" style={{ marginRight: 4 }}>
        회차
      </span>
      {overview.sessions.map((s) => (
        <button
          key={s._id}
          type="button"
          className={`sess ${s.date < today ? "done" : ""}`}
          aria-current={s._id === session?._id}
          onClick={() => selectSession(s._id)}
        >
          {s.no}회차 · {fmtSession(s.date)}
          {s.date === today ? " · 오늘" : ""}
        </button>
      ))}
    </div>
  );
}

/** 회차나 참여자가 없으면 해당 단계로 안내 */
export function NeedsSetup() {
  const { overview, hrefFor } = useEvent();
  if (!overview.sessions.length)
    return (
      <div className="empty">
        <strong>회차가 없어요</strong>
        <span className="hint">1단계에서 회차(날짜)를 먼저 추가하세요.</span>
        <Link className="btn" href={hrefFor("sessions")}>
          회차 추가하러 가기
        </Link>
      </div>
    );
  if (!overview.participantCount)
    return (
      <div className="empty">
        <strong>참여 인원이 없어요</strong>
        <span className="hint">2단계에서 회원 명부에서 참여자를 골라 확정하세요.</span>
        <Link className="btn" href={hrefFor("participants")}>
          참여 인원 정하러 가기
        </Link>
      </div>
    );
  return null;
}
