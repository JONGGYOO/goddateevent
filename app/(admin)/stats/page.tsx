"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAQ, useToday } from "@/components/admin";
import { G_OPTIONS, Hl, Loading, Meter, SearchBox, Seg, Stat, pct, type GFilter } from "@/components/kit";
import type { FunctionReturnType } from "convex/server";
import { fmtSession } from "@/lib/date";
import { koCompare, matchAt } from "@/lib/hangul";

type Scope = "event" | "cars" | "all";
type SortKey = "name" | "low" | "many";

export default function StatsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Stats />
    </Suspense>
  );
}

function Stats() {
  const search = useSearchParams();
  const router = useRouter();
  const today = useToday();
  const events = useAQ(api.events.list, { today });
  const sp = search.get("scope");
  const scope: Scope = sp === "all" || sp === "cars" ? sp : "event";
  const [g, setG] = useState<GFilter>("ALL");
  const [q, setQ] = useState(search.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("name");
  const [eventId, setEventId] = useState<Id<"events"> | null>(null);

  const evId = useMemo(() => {
    if (!events?.length) return null;
    if (eventId && events.some((e) => e._id === eventId)) return eventId;
    return (events.find((e) => e.firstDate && e.firstDate <= today) ?? events[0])._id;
  }, [events, eventId, today]);

  const setScope = (s: Scope) => {
    if (s === "event" && sort === "many") setSort("name");
    router.replace(s === "event" ? "/stats" : `/stats?scope=${s}`, { scroll: false });
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>통계</h1>
        </div>
      </div>
      <div className="controls">
        <Seg
          value={scope}
          onChange={setScope}
          label="통계 범위"
          options={[
            ["event", "행사별"],
            ["cars", "차량 내역"],
            ["all", "회원 누적"],
          ]}
        />
        {scope !== "all" && events && events.length > 0 && (
          <select className="sel" aria-label="행사" value={evId ?? ""} onChange={(e) => setEventId(e.target.value as Id<"events">)}>
            {events.map((e) => (
              <option key={e._id} value={e._id}>
                제{e.no}회 {e.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {scope !== "all" ? (
        !events ? (
          <Loading />
        ) : !evId ? (
          <div className="empty">
            <strong>행사가 없어요</strong>
          </div>
        ) : (
          scope === "cars" ? (
            <CarStats key={evId} eventId={evId} today={today} />
          ) : (
            <EventStats eventId={evId} today={today} g={g} setG={setG} q={q} setQ={setQ} sort={sort} setSort={setSort} />
          )
        )
      ) : (
        <MemberStats today={today} g={g} setG={setG} q={q} setQ={setQ} sort={sort} setSort={setSort} />
      )}
    </>
  );
}

type FilterProps = {
  g: GFilter;
  setG: (g: GFilter) => void;
  q: string;
  setQ: (q: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
};

function Filters({ g, setG, q, setQ, sort, setSort, sorts }: FilterProps & { sorts: readonly (readonly [SortKey, string])[] }) {
  return (
    <div className="controls">
      <Seg value={g} options={G_OPTIONS} onChange={setG} label="성별" />
      <SearchBox value={q} onChange={setQ} placeholder="이름·초성 검색" />
      <Seg value={sort} options={sorts} onChange={setSort} label="정렬" />
    </div>
  );
}

function EventStats({ eventId, today, ...f }: { eventId: Id<"events">; today: string } & FilterProps) {
  const data = useAQ(api.stats.byEvent, { eventId });
  if (data === undefined) return <Loading />;
  if (data === null) return <div className="empty">행사를 찾을 수 없어요.</div>;

  const { people, sessions } = data;
  const held = sessions.filter((s) => s.date <= today);
  const attSets = new Map(sessions.map((s) => [s._id, new Set<string>(s.attended)]));
  const did = (sid: Id<"sessions">, mid: string) => attSets.get(sid)?.has(mid) ?? false;
  const tot = held.length * people.length;
  const got = held.reduce((n, s) => n + s.attended.length, 0);
  const carAvg = held.length ? held.reduce((n, s) => n + s.cars, 0) / held.length : null;
  const rateG = (g: "M" | "F") => {
    const L = people.filter((p) => p.gender === g);
    const t = held.length * L.length;
    return t ? held.reduce((n, s) => n + L.filter((p) => did(s._id, p.memberId)).length, 0) / t : null;
  };
  const mN = people.filter((p) => p.gender === "M").length;
  const qn = f.q.replace(/\s+/g, "");

  const rows = people
    .filter((p) => (f.g === "ALL" || p.gender === f.g) && (!qn || matchAt(p.name, qn) >= 0))
    .map((p) => {
      const a = held.filter((s) => did(s._id, p.memberId)).length;
      return { ...p, a, rate: held.length ? a / held.length : null };
    })
    .sort((x, y) =>
      f.sort === "low"
        ? (x.rate ?? 2) - (y.rate ?? 2) || koCompare(x.name, y.name)
        : x.gender === y.gender
          ? koCompare(x.name, y.name)
          : x.gender === "M"
            ? -1
            : 1,
    );

  return (
    <div className="stack">
      <section className="summary">
        <Stat label="진행한 회차" value={held.length} total={sessions.length} />
        <Stat label="평균 출석률" value={pct(tot ? got / tot : null)} ratio={tot ? got / tot : 0} />
        <Stat label={`형제 ${mN}명`} value={pct(rateG("M"))} ratio={rateG("M") ?? 0} g="M" />
        <Stat label={`자매 ${people.length - mN}명`} value={pct(rateG("F"))} ratio={rateG("F") ?? 0} g="F" />
        <Stat label="회차당 차량" value={carAvg == null ? "-" : carAvg.toFixed(1)} unit="대" />
      </section>

      <h2 className="sectitle">회차별 출석</h2>
      <div className="tablewrap compact">
        <table>
          <thead>
            <tr>
              <th>회차</th>
              <th>형제</th>
              <th>자매</th>
              <th>출석률</th>
              <th>차량</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length ? (
              sessions.map((s) => {
                if (s.date > today)
                  return (
                    <tr key={s._id}>
                      <td>
                        <strong>{s.no}회차</strong>
                        <span className="sub2">{fmtSession(s.date)}</span>
                      </td>
                      <td colSpan={4} className="muted">
                        예정
                      </td>
                    </tr>
                  );
                const c = (g: "M" | "F") => {
                  const L = people.filter((p) => p.gender === g);
                  return `${L.filter((p) => did(s._id, p.memberId)).length}/${L.length}`;
                };
                return (
                  <tr key={s._id}>
                    <td>
                      <strong>{s.no}회차</strong> {s.date === today && <span className="pill ok">오늘</span>}
                      <span className="sub2">{fmtSession(s.date)}</span>
                    </td>
                    <td className="num">{c("M")}</td>
                    <td className="num">{c("F")}</td>
                    <td>
                      <Meter ratio={people.length ? s.attended.length / people.length : null} />
                    </td>
                    <td className="num">{s.cars}대</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  회차가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="sectitle">참여자별 출석</h2>
      <Filters
        {...f}
        sorts={[
          ["name", "이름순"],
          ["low", "출석률 낮은 순"],
        ]}
      />
      <div className="tablewrap compact">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>
                <span className="marks">
                  {sessions.map((s) => (
                    <span key={s._id} className="mk f" title={fmtSession(s.date)}>
                      {s.no}
                    </span>
                  ))}
                </span>
              </th>
              <th>출석</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p) => (
                <tr key={p.memberId}>
                  <td>
                    <span className={`dot ${p.gender}`} />
                    <span className="nm">
                      <Hl text={p.name} q={qn} />
                    </span>
                  </td>
                  <td>
                    <span className="marks">
                      {sessions.map((s) =>
                        s.date > today ? (
                          <span key={s._id} className="mk f">
                            ·
                          </span>
                        ) : did(s._id, p.memberId) ? (
                          <span key={s._id} className="mk y">
                            ✓
                          </span>
                        ) : (
                          <span key={s._id} className="mk n">
                            ✕
                          </span>
                        ),
                      )}
                    </span>
                  </td>
                  <td>
                    <AttCell a={p.a} t={held.length} rate={p.rate} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="muted">
                  해당하는 참여자가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        <span className="mk y">✓</span> 출석 · <span className="mk n">✕</span> 결석 · <span className="mk f">·</span> 예정 회차
      </p>
    </div>
  );
}

/** 출석 칸: "3/4" + 출석률 (좁은 화면에서도 한 칸) */
function AttCell({ a, t, rate }: { a: number; t: number; rate: number | null }) {
  if (!t) return <span className="muted">-</span>;
  return (
    <span className="att">
      <span className="num">
        {a}/{t}
      </span>
      <Meter ratio={rate} />
    </span>
  );
}

type EventStatsData = NonNullable<FunctionReturnType<typeof api.stats.byEvent>>;

function CarStats({ eventId, today }: { eventId: Id<"events">; today: string }) {
  const data = useAQ(api.stats.byEvent, { eventId });
  if (data === undefined) return <Loading />;
  if (data === null) return <div className="empty">행사를 찾을 수 없어요.</div>;
  return (
    <div className="stack">
      <p className="hint" style={{ margin: 0 }}>
        회차를 고르면 그 회차에 도착 체크된 차량을 볼 수 있어요. ‘목록 복사’로 카카오톡이나 문자에 바로 붙여 넣을 수 있어요.
      </p>
      <SessionCars event={data.event} sessions={data.sessions} people={data.people} today={today} />
    </div>
  );
}

/** 클립보드 복사 (권한이 없거나 http면 textarea 방식으로) */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** 회차를 골라 도착 체크된 차량(번호·운전자)만 본다. 지난 회차 + 날짜와 상관없이 도착 차량이 있는 회차 */
function SessionCars({
  event,
  sessions,
  people,
  today,
}: {
  event: EventStatsData["event"];
  sessions: EventStatsData["sessions"];
  people: EventStatsData["people"];
  today: string;
}) {
  const held = sessions.filter((s) => s.date <= today || s.carChecks.length > 0);
  const [picked, setPicked] = useState<Id<"sessions"> | null>(null);
  const cur = held.find((s) => s._id === picked) ?? [...held].reverse().find((s) => s.carChecks.length) ?? held[held.length - 1];
  if (!cur) return <div className="empty flat box">아직 진행한 회차나 도착 체크된 차량이 없어요.</div>;

  const byId = new Map(people.map((p) => [p.memberId as string, p]));
  const rows = cur.carChecks
    .flatMap((c) => {
      const p = byId.get(c.memberId);
      return p ? [{ key: `${c.memberId}-${c.plate}`, plate: c.plate, p, at: c.at }] : [];
    })
    .sort((a, b) => a.at - b.at);

  const copy = async () => {
    const text = [
      `[제${event.no}회 ${event.name}] ${cur.no}회차 ${fmtSession(cur.date)} 차량 ${rows.length}대`,
      ...rows.map((r, i) => `${i + 1}. ${r.plate} ${r.p.name}`),
    ].join("\n");
    toast((await copyText(text)) ? `${rows.length}대 목록을 복사했어요. 카카오톡이나 문자에 붙여 넣으세요.` : "복사하지 못했어요. 목록을 길게 눌러 직접 복사해 주세요.");
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="controls">
        <div className="sessbar">
          {held.map((s) => (
            <button key={s._id} type="button" className="sess done" aria-current={s._id === cur._id} onClick={() => setPicked(s._id)}>
              {s.no}회차 · {fmtSession(s.date)}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="hint">
          {cur.no}회차 도착 <strong className="num">{rows.length}</strong>대
        </span>
        <button className="btn" type="button" disabled={!rows.length} onClick={copy}>
          목록 복사
        </button>
      </div>
      <div className="tablewrap fit">
        <table>
          <thead>
            <tr>
              <th>차량번호</th>
              <th>운전자</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="plate">{r.plate}</span>
                  </td>
                  <td>
                    <span className={`dot ${r.p.gender}`} />
                    <span className="nm">{r.p.name}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="muted">
                  이 회차에 도착 체크된 차량이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberStats({ today, ...f }: { today: string } & FilterProps) {
  const data = useAQ(api.stats.byMember, {});
  const qn = f.q.replace(/\s+/g, "");
  const rows = useMemo(() => {
    if (!data) return [];
    const evs = data.events.map((e) => ({
      ...e,
      members: new Set<string>(e.memberIds),
      held: e.sessions.filter((s) => s.date <= today).map((s) => new Set<string>(s.attended)),
    }));
    const nm = (x: { name: string }, y: { name: string }) => koCompare(x.name, y.name);
    return data.members
      .filter((m) => (f.g === "ALL" || m.gender === f.g) && (!qn || matchAt(m.name, qn) >= 0))
      .map((m) => {
        const hs = evs.filter((e) => e.members.has(m._id)).map((e) => ({ no: e.no, marks: e.held.map((set) => set.has(m._id)) }));
        const t = hs.reduce((n, x) => n + x.marks.length, 0);
        const a = hs.reduce((n, x) => n + x.marks.filter(Boolean).length, 0);
        return { ...m, hs, t, a, rate: t ? a / t : null };
      })
      .sort((x, y) =>
        f.sort === "many" ? y.hs.length - x.hs.length || nm(x, y) : f.sort === "low" ? (x.rate ?? 2) - (y.rate ?? 2) || nm(x, y) : nm(x, y),
      );
  }, [data, today, f.g, qn, f.sort]);

  if (!data) return <Loading />;
  return (
    <div className="stack">
      <p className="hint" style={{ margin: 0 }}>
        모든 행사를 합친 회원별 참여 이력과 누적 출석률입니다.
      </p>
      <Filters
        {...f}
        sorts={[
          ["name", "이름순"],
          ["many", "참여 많은 순"],
          ["low", "출석률 낮은 순"],
        ]}
      />
      <div className="tablewrap compact">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>참여 행사 · 회차별 출석</th>
              <th>출석</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((m) => (
                <tr key={m._id}>
                  <td>
                    <span className={`dot ${m.gender}`} />
                    <span className="nm">
                      <Hl text={m.name} q={qn} />
                    </span>
                  </td>
                  <td style={{ whiteSpace: "normal" }}>
                    {m.hs.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {m.hs.map((x) => (
                          <span key={x.no} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span className="pill ac">
                              제{x.no}회
                            </span>
                            <span className="marks">
                              {x.marks.length ? (
                                x.marks.map((v, i) => (
                                  <span key={i} className={`mk ${v ? "y" : "n"}`}>
                                    {v ? "✓" : "✕"}
                                  </span>
                                ))
                              ) : (
                                <span className="hint">진행 전</span>
                              )}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">참여 없음</span>
                    )}
                  </td>
                  <td>
                    <AttCell a={m.a} t={m.t} rate={m.rate} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="muted">
                  해당하는 회원이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
