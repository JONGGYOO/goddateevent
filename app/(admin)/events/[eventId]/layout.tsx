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
  ["participants", "1", "참여 인원"],
  ["sessions", "2", "회차 관리"],
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
  const tab = TABS.find(([t]) => pathname.endsWith(`/${t}`))?.[0] ?? "participants";
  const summary: Record<(typeof TABS)[number][0], string> = {
    sessions: `${sessions.length}개 회차`,
    participants: `남 ${male} · 여 ${female}${event.participantsLocked ? " · 확정" : ""}`,
    groups: session
      ? `${session.no}회차 ${session.groupCount ? `${session.groupCount}개 조${session.groupLocked ? " · 확정" : ""}` : "미편성"}`
      : "회차 필요",
    check: session ? `${session.no}회차 ${session.attended}/${male + female}명` : "회차 필요",
  };
  // 휴대폰: ①─②─③─④ 진행 표시 + 아래 요약 한 줄 (회차는 아래 회차 칩에 보이므로 뺀다)
  const ok = <span className="ok">✓</span>;
  const cur = TABS.findIndex(([t]) => t === tab);
  const short: Record<(typeof TABS)[number][0], string> = { participants: "참여", sessions: "회차", groups: "조 편성", check: "출석" };
  const mobileInfo: [string, ReactNode][] = [
    [
      "참여",
      <>
        <span className="M">남{male}</span>·<span className="F">여{female}</span>
        {event.participantsLocked && <> {ok}</>}
      </>,
    ],
    ["회차", `${sessions.length}개`],
    [
      "조",
      session?.groupCount ? (
        <>
          {session.groupCount}개{session.groupLocked && <> {ok}</>}
        </>
      ) : session ? (
        "미편성"
      ) : (
        "-"
      ),
    ],
    ["출석", session ? `${session.attended}/${male + female}` : "-"],
  ];

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
        {TABS.map(([t, n, label], i) => (
          <Link
            key={t}
            href={hrefFor(t)}
            className={`step ${i < cur ? "done" : ""}`}
            aria-label={`${n}단계 ${label} · ${summary[t]}`}
            aria-current={tab === t ? "page" : undefined}
          >
            <span className="s1">{n}단계</span>
            <span className="s2">{label}</span>
            <span className="s3">{summary[t]}</span>
            <span className="num" aria-hidden>
              {n}
            </span>
            <span className="lab" aria-hidden>
              {short[t]}
            </span>
          </Link>
        ))}
      </nav>
      <div className="stepinfo" aria-hidden>
        {mobileInfo.map(([k, v]) => (
          <span key={k}>
            {k} <b>{v}</b>
          </span>
        ))}
      </div>
      <div className="stack">{children}</div>
    </EventContext.Provider>
  );
}
