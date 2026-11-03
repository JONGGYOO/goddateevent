"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAQ, useToday } from "@/components/admin";
import { Loading } from "@/components/kit";
import { EventContext, defaultSession, type EventCtx } from "@/components/events/event-context";

const TABS = [
  ["sessions", "1", "회차 관리"],
  ["participants", "2", "참여 인원"],
  ["groups", "3", "조 편성"],
  ["check", "4", "출석체크"],
] as const;

export default function EventLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <EventShell>{children}</EventShell>
    </Suspense>
  );
}

function EventShell({ children }: { children: ReactNode }) {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId as Id<"events">;
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const today = useToday();
  const overview = useAQ(api.events.overview, { eventId });

  const wanted = search.get("session");
  const session = useMemo(() => {
    if (!overview) return null;
    return overview.sessions.find((s) => s._id === wanted) ?? defaultSession(overview.sessions, today);
  }, [overview, wanted, today]);

  const hrefFor = useCallback<EventCtx["hrefFor"]>(
    (tab, sid) => {
      const s = sid ?? session?._id;
      return `/events/${eventId}/${tab}${s ? `?session=${s}` : ""}`;
    },
    [eventId, session?._id],
  );
  const selectSession = useCallback(
    (id: Id<"sessions">) => router.replace(`${pathname}?session=${id}`, { scroll: false }),
    [router, pathname],
  );

  if (overview === undefined) return <Loading />;
  if (overview === null)
    return (
      <div className="empty">
        <strong>행사를 찾을 수 없어요</strong>
        <span className="hint">삭제됐거나 주소가 잘못됐어요.</span>
        <Link className="btn" href="/events">
          행사 목록으로
        </Link>
      </div>
    );

  const { event, male, female, sessions } = overview;
  const tab = TABS.find(([t]) => pathname.endsWith(`/${t}`))?.[0] ?? "sessions";
  const summary: Record<(typeof TABS)[number][0], string> = {
    sessions: `${sessions.length}개 회차`,
    participants: `남 ${male} · 여 ${female}`,
    groups: session ? `${session.no}회차 ${session.groupCount ? `${session.groupCount}개 조` : "미편성"}` : "회차 필요",
    check: session ? `${session.no}회차 ${session.attended}/${male + female}명` : "회차 필요",
  };

  return (
    <EventContext.Provider value={{ eventId, overview, today, session, selectSession, hrefFor }}>
      <div className="pagehead">
        <div>
          <Link className="back" href="/events">
            ← 행사 목록
          </Link>
          <h1>
            제{event.no}회 {event.name}
          </h1>
        </div>
      </div>
      <nav className="steps" aria-label="행사 진행 단계">
        {TABS.map(([t, n, label]) => (
          <Link key={t} href={hrefFor(t)} className="step" aria-current={tab === t ? "page" : undefined}>
            <span className="s1">{n}단계</span>
            <span className="s2">{label}</span>
            <span className="s3">{summary[t]}</span>
          </Link>
        ))}
      </nav>
      <div className="stack">{children}</div>
    </EventContext.Provider>
  );
}
