"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ } from "@/components/admin";
import { G_OPTIONS, Hl, Loading, SearchBox, Seg, Stat, countNames, type GFilter } from "@/components/kit";
import { NeedsSetup, SessBar, useEvent } from "@/components/events/event-context";
import { DetailSheet } from "@/components/check/detail-sheet";
import { WalkIn } from "@/components/check/walk-in";
import { MemoSheet } from "@/components/check/memo-sheet";
import type { Person } from "@/components/check/types";
import { koCompare, matchAt, stripCho } from "@/lib/hangul";
import { hm } from "@/lib/date";
import { errInfo } from "@/lib/errors";
import { plateHead, plateTail } from "@/lib/plate";

const MODES = [
  ["people", "출석"],
  ["car", "차량"],
] as const;

const LOG_LABEL = { in: "출석", out: "출석 취소", car: "차량 도착", carout: "차량 취소" } as const;

export default function CheckTab() {
  const { session, overview } = useEvent();
  if (!session || !overview.participantCount) return <NeedsSetup />;
  return <CheckBoard key={session._id} sessionId={session._id} />;
}

function CheckBoard({ sessionId }: { sessionId: Id<"sessions"> }) {
  const board = useAQ(api.checkin.boardBySession, { sessionId });
  const checkIn = useAM(api.checkin.checkIn);
  const cancel = useAM(api.checkin.cancelCheckIn);
  const carIn = useAM(api.checkin.carIn);
  const carOut = useAM(api.checkin.carOut);
  const [mode, setMode] = useState<"people" | "car">("people");
  const [g, setG] = useState<GFilter>("ALL");
  const [q, setQ] = useState("");
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [vq, setVq] = useState("");
  const [onlyNoCar, setOnlyNoCar] = useState(false);
  const [detail, setDetail] = useState<Id<"members"> | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [memoFor, setMemoFor] = useState<Id<"members"> | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // 서버 반영 전에도 카드가 바로 바뀌도록 (낙관적 표시)
  const [pending, setPending] = useState<Map<Id<"members">, number>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);
  const plateRef = useRef<HTMLInputElement>(null);

  const people = useMemo(() => board?.people ?? [], [board]);
  const dup = useMemo(() => countNames(people.map((p) => p.name)), [people]);

  const qn = q.replace(/\s+/g, "");
  const list = useMemo(() => {
    let L = people.filter((p) => {
      if (!qn) return true;
      if (/^\d+$/.test(qn)) return (p.phone ?? "").replace(/\D/g, "").endsWith(qn);
      return matchAt(p.name, qn) >= 0;
    });
    if (g !== "ALL") L = L.filter((p) => p.gender === g);
    if (onlyAbsent) L = L.filter((p) => !p.att && !pending.has(p.memberId));
    return L.sort((a, b) => (a.gender === b.gender ? koCompare(a.name, b.name) || (a.phone ?? "").localeCompare(b.phone ?? "") : a.gender === "M" ? -1 : 1));
  }, [people, qn, g, onlyAbsent, pending]);

  if (board === undefined) return <Loading />;
  if (board === null) return <div className="empty">회차를 찾을 수 없어요. 회차 목록에서 다시 골라 주세요.</div>;

  const s = board.session;
  const isOn = (p: Person) => !!p.att || pending.has(p.memberId);
  const cnt = (gg: "M" | "F") => [people.filter((p) => p.gender === gg && isOn(p)).length, people.filter((p) => p.gender === gg).length];
  const [mi, mt] = cnt("M");
  const [fi, ft] = cnt("F");
  const withCar = people.filter((p) => p.cars.length);
  const carsArrived = people.filter((p) => p.car).length;

  const tapCard = async (p: Person) => {
    if (p.att) return setDetail(p.memberId);
    if (pending.has(p.memberId)) return;
    setPending((m) => new Map(m).set(p.memberId, Date.now()));
    if (q) {
      setQ("");
      searchRef.current?.focus();
    }
    try {
      const r = await checkIn({ sessionId, memberId: p.memberId });
      const msg = (
        <span>
          <strong>{r.name}</strong> 출석{r.group ? <> · <strong>{r.group}조</strong></> : null}
        </span>
      );
      if (r.created) {
        toast(msg, {
          duration: 5000,
          action: {
            label: "되돌리기",
            onClick: () => {
              cancel({ sessionId, memberId: p.memberId, undo: true }).catch((e) => toast(errInfo(e).message));
            },
          },
        });
      } else {
        toast(msg, { description: `이미 ${hm(r.at)}에 출석 처리됐어요` });
      }
    } catch (e) {
      toast(errInfo(e).message);
    } finally {
      setPending((m) => {
        const n = new Map(m);
        n.delete(p.memberId);
        return n;
      });
    }
  };

  const tapPlate = async (p: Person, plate: string) => {
    try {
      if (p.car?.plate === plate) {
        await carOut({ sessionId, memberId: p.memberId });
        toast(`${plate} 도착 취소`);
      } else {
        if (vq) {
          setVq("");
          plateRef.current?.focus();
        }
        await carIn({ sessionId, memberId: p.memberId, plate });
        toast(
          <span>
            <strong>{plate}</strong> 도착 · {p.name}
          </span>,
          {
            duration: 5000,
            action: {
              label: "되돌리기",
              onClick: () => {
                carOut({ sessionId, memberId: p.memberId, undo: true }).catch((e) => toast(errInfo(e).message));
              },
            },
          },
        );
      }
    } catch (e) {
      toast(errInfo(e).message);
    }
  };

  const vqn = vq.replace(/\D/g, "");
  const plates = people
    .flatMap((p) => p.cars.map((plate) => ({ p, plate })))
    .filter((x) => !vqn || plateTail(x.plate).includes(vqn))
    .filter((x) => !onlyNoCar || !x.p.car)
    .sort((a, b) => plateTail(a.plate).localeCompare(plateTail(b.plate)));

  const detailPerson = detail ? people.find((p) => p.memberId === detail) : undefined;
  const memoPerson = memoFor ? people.find((p) => p.memberId === memoFor) : undefined;

  return (
    <>
      <SessBar />
      <div className="controls ckmodebar">
        <span className="spacer" />
        <Seg value={mode} options={MODES} onChange={setMode} label="모드" />
      </div>
      <section className="summary cksum">
        <Stat label="형제(남)" value={mi} total={mt} ratio={mt ? mi / mt : 0} g="M" />
        <Stat label="자매(여)" value={fi} total={ft} ratio={ft ? fi / ft : 0} g="F" />
        <Stat label="차량 도착" value={carsArrived} total={`${withCar.length}대`} ratio={withCar.length ? carsArrived / withCar.length : 0} />
      </section>
      {/* 휴대폰: 최근 체크(접기) + 출석/차량 전환을 한 줄로 */}
      <div className="ckbar">
        <button className="logbtn" type="button" aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
          최근 체크 <b>{board.logs.length}건</b>
          {board.logs[0] && (
            <span className="last">
              {hm(board.logs[0].at)} {board.logs[0].name} {LOG_LABEL[board.logs[0].kind]}
            </span>
          )}
          <span aria-hidden>{logOpen ? "▴" : "▾"}</span>
        </button>
        <Seg value={mode} options={MODES} onChange={setMode} label="모드" />
      </div>
      {logOpen && (
        <ol className="cklogm">
          {board.logs.length ? (
            board.logs.slice(0, 15).map((l) => (
              <li key={l._id}>
                <span className="num">{hm(l.at)}</span>
                <span>
                  {l.name}{" "}
                  <span className="hint" style={l.kind === "out" || l.kind === "carout" ? { textDecoration: "line-through" } : undefined}>
                    {LOG_LABEL[l.kind]}
                  </span>
                </span>
              </li>
            ))
          ) : (
            <li>
              <span className="hint">아직 체크한 사람이 없어요</span>
            </li>
          )}
        </ol>
      )}

      <div className="ckmain">
        <div className="stack" style={{ gap: 12 }}>
          {mode === "people" ? (
            <>
              <div className="controls cktools">
                <Seg value={g} options={G_OPTIONS} onChange={setG} label="성별" />
                <SearchBox ref={searchRef} big value={q} onChange={setQ} placeholder="이름·초성(ㄱㅁㅅ)·전화 뒷자리" />
                <label className="chk">
                  <input type="checkbox" checked={onlyAbsent} onChange={(e) => setOnlyAbsent(e.target.checked)} /> 미출석만
                </label>
                <button className="btn ghost" type="button" onClick={() => setWalkIn(true)}>
                  + 현장 등록
                </button>
              </div>
              <div className="cgrid">
                {list.length ? (
                  list.map((p) => {
                    const on = isOn(p);
                    const at = p.att?.at ?? pending.get(p.memberId);
                    return (
                      <div key={p.memberId} className={`card ${p.gender} ${on ? "on" : ""}`}>
                      <button type="button" className="cbody" aria-pressed={on} onClick={() => tapCard(p)}>
                        <span className="g" />
                        <span className="nl">
                          <span className="name">
                            <Hl text={p.name} q={/^\d+$/.test(qn) ? "" : qn} />
                          </span>
                          {p.group && <span className="grpn">{p.group}조</span>}
                          {(dup.get(p.name) ?? 0) > 1 && <span className="dup">동명이인</span>}
                        </span>
                        <span className="ft">
                          <span className="ph num">{p.phone ? `☎ ${p.phone.slice(-4)}` : ""}</span>
                          {p.att && p.cars.length > 0 && <span className={`cf ${p.car ? "y" : ""}`}>{p.car ? "차량 ✓" : "차량"}</span>}
                          <span className="st">{on && at ? `출석 ${hm(at)}` : "미출석"}</span>
                        </span>
                      </button>
                      <button type="button" className={`cmemo ${p.memo ? "has" : ""}`} aria-label={`${p.name} 메모`} onClick={() => setMemoFor(p.memberId)}>
                        {p.memo ? (
                          <>
                            {p.memo.codes.map((c) => (
                              <span key={c._id} className="tag">
                                {c.label}
                              </span>
                            ))}
                            {p.memo.text && <span className="txt">{p.memo.text}</span>}
                          </>
                        ) : (
                          <span className="add">+ 메모</span>
                        )}
                      </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">
                    <strong>{q ? `‘${q}’에 해당하는 참여자가 없어요` : "표시할 참여자가 없어요"}</strong>
                    <span className="hint">명단에 없는 분이면 현장 등록으로 회원 등록과 출석을 한 번에 하세요.</span>
                    <button className="btn" type="button" onClick={() => setWalkIn(true)}>
                      + 현장 등록
                    </button>
                  </div>
                )}
              </div>
              <p className="hint ckhint" style={{ margin: 0 }}>
                카드를 누르면 바로 {s.no}회차 출석 처리됩니다. 출석한 카드를 다시 누르면 차량 체크나 출석 취소를 할 수 있어요. 카드 아래 메모 칸을 누르면
                출석 없이 메모만 남겨요.
              </p>
            </>
          ) : (
            <>
              <div className="controls cktools">
                <SearchBox ref={plateRef} big numeric value={vq} onChange={setVq} placeholder="차량번호 뒷 4자리 (예: 2074)" />
                <label className="chk">
                  <input type="checkbox" checked={onlyNoCar} onChange={(e) => setOnlyNoCar(e.target.checked)} /> 미도착만
                </label>
              </div>
              <div className="pcards">
                {plates.length ? (
                  plates.map(({ p, plate }) => {
                    const on = p.car?.plate === plate;
                    const tail = plateTail(plate);
                    const i = vqn ? tail.indexOf(vqn) : -1;
                    return (
                      <button key={`${p.memberId}-${plate}`} type="button" className={`pcard ${on ? "on" : ""}`} onClick={() => tapPlate(p, plate)}>
                        <span className="plate lg">
                          {plateHead(plate)}
                          {i >= 0 ? (
                            <>
                              {tail.slice(0, i)}
                              <b>{tail.slice(i, i + vqn.length)}</b>
                              {tail.slice(i + vqn.length)}
                            </>
                          ) : (
                            tail
                          )}
                        </span>
                        <span className="ow">
                          <span>
                            <span className={`dot ${p.gender}`} />
                            <strong>{p.name}</strong> <span className="hint">{p.att ? "본인 출석" : "본인 미출석"}</span>
                          </span>
                          <span className={`pill ${on ? "ok" : "off"}`}>{on && p.car ? `도착 ${hm(p.car.at)}` : "미도착"}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty">
                    <strong>일치하는 참여자 차량이 없어요</strong>
                    <span className="hint">운전자 이름으로 출석 화면에서 찾아 차량번호를 입력하세요.</span>
                  </div>
                )}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                참여자 차량만 표시됩니다. 미등록 차량은 출석 화면에서 이름을 눌러 번호를 입력하세요.
              </p>
            </>
          )}
        </div>
        <aside className="box cklog">
          <h2>{s.no}회차 최근 체크</h2>
          <ol>
            {board.logs.length ? (
              board.logs.map((l) => (
                <li key={l._id}>
                  <span className="hint num">{hm(l.at)}</span>
                  <span>
                    <span className={`dot ${l.kind.startsWith("car") ? "car" : l.gender}`} />
                    {l.name}{" "}
                    <span className="hint" style={l.kind === "out" || l.kind === "carout" ? { textDecoration: "line-through" } : undefined}>
                      {LOG_LABEL[l.kind]}
                    </span>
                  </span>
                </li>
              ))
            ) : (
              <li>
                <span />
                <span className="hint">아직 체크한 사람이 없어요</span>
              </li>
            )}
          </ol>
          <p className="hint" style={{ margin: 0, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            여러 기기에서 같은 회차를 열면 화면이 실시간으로 함께 바뀝니다.
          </p>
        </aside>
      </div>

      {detailPerson && (
        <DetailSheet person={detailPerson} sessionId={sessionId} sessionNo={s.no} allPeople={people} onClose={() => setDetail(null)} />
      )}
      {memoPerson && (
        <MemoSheet key={memoPerson.memberId} person={memoPerson} sessionId={sessionId} sessionNo={s.no} onClose={() => setMemoFor(null)} />
      )}
      {walkIn && (
        <WalkIn
          sessionId={sessionId}
          sessionNo={s.no}
          initialName={stripCho(q.trim()).replace(/\d/g, "")}
          initialGender={g === "F" ? "F" : "M"}
          onClose={() => {
            setWalkIn(false);
            setQ("");
          }}
        />
      )}
    </>
  );
}
