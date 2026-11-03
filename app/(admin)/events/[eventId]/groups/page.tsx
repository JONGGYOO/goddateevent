"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ } from "@/components/admin";
import { GN, Loading, Modal, ModalTitle, Seg, type G } from "@/components/kit";
import { NeedsSetup, SessBar, useEvent } from "@/components/events/event-context";
import {
  buildMet,
  defaultGroupCount,
  groupsOf,
  isAssigned,
  pairKey,
  scoreGrouping,
  solveGroups,
  type Assign,
  type GroupMode,
  type PriorGrouping,
} from "@/lib/grouping";
import { koCompare } from "@/lib/hangul";
import { errInfo } from "@/lib/errors";

const HINT: Record<GroupMode, string> = {
  all: "남녀 모두 새로 섞습니다. 조마다 남녀 인원이 고르게 들어갑니다.",
  fixM: "남자는 지금 조에 그대로 두고 여자만 다시 섞습니다. 비어 있으면 ‘이전 회차 불러오기’로 시작하세요.",
  fixF: "여자는 지금 조에 그대로 두고 남자만 다시 섞습니다. 비어 있으면 ‘이전 회차 불러오기’로 시작하세요.",
};

type Draft = { k: number; assign: Assign };
type Sheet = { kind: "person"; id: string } | { kind: "add"; gi: number; g: G } | null;

export default function GroupsTab() {
  const { session, overview } = useEvent();
  if (!session || !overview.participantCount) return <NeedsSetup />;
  return <GroupsBoard key={session._id} sessionId={session._id} />;
}

function GroupsBoard({ sessionId }: { sessionId: Id<"sessions"> }) {
  const data = useAQ(api.groupings.getBySession, { sessionId });
  const saveM = useAM(api.groupings.save);
  const [mode, setMode] = useState<GroupMode>("all");
  const [avoid, setAvoid] = useState(true);
  const [local, setLocal] = useState<Draft | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const seq = useRef(0);

  const people = useMemo(() => (data?.people ?? []).map((p) => ({ id: p.memberId as string, gender: p.gender, name: p.name })), [data]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const ids = useMemo(() => people.map((p) => p.id), [people]);
  const priors: PriorGrouping[] = useMemo(
    () =>
      (data?.prior ?? []).map((pr) => ({
        no: pr.no,
        assign: Object.fromEntries(pr.assignments.filter((a) => a.group < pr.groupCount).map((a) => [a.memberId, a.group])),
      })),
    [data],
  );
  const met = useMemo(() => buildMet(priors), [priors]);

  const server: Draft | null = useMemo(() => {
    if (!data) return null;
    if (!data.grouping) return { k: defaultGroupCount(people.length), assign: {} };
    return { k: data.grouping.groupCount, assign: Object.fromEntries(data.grouping.assignments.map((a) => [a.memberId, a.group])) };
  }, [data, people.length]);

  if (!data || !server) return data === null ? <div className="empty">회차를 찾을 수 없어요.</div> : <Loading />;

  const cur = local ?? server;
  const { k, assign } = cur;
  const gender = (id: string) => byId.get(id)?.gender ?? "M";
  const name = (id: string) => byId.get(id)?.name ?? "";
  const fixG: G | null = mode === "fixM" ? "M" : mode === "fixF" ? "F" : null;
  const gm = groupsOf(assign, ids, k);
  const score = scoreGrouping(people, k, assign, met);
  const prev = data.prior[data.prior.length - 1];

  /** 변경 즉시 저장 (자동 저장). 저장이 끝나기 전에는 화면에 바로 보이도록 local로 유지 */
  const commit = async (next: Draft) => {
    const my = ++seq.current;
    setLocal(next);
    try {
      await saveM({
        sessionId,
        groupCount: next.k,
        assignments: Object.entries(next.assign)
          .filter(([, g]) => g != null && g >= 0 && g < next.k)
          .map(([memberId, group]) => ({ memberId: memberId as Id<"members">, group: group as number })),
      });
    } catch (e) {
      toast(errInfo(e).message);
    } finally {
      if (seq.current === my) setLocal(null);
    }
  };

  const metInGroup = (id: string, gi: number, a: Assign = assign) =>
    groupsOf(a, ids, k)[gi].filter((o) => o !== id && gender(o) !== gender(id) && met.has(pairKey(id, o)));

  const mixedMetPairs = (a: Assign) => scoreGrouping(people, k, a, met).mixedPairs;

  const randomize = () => {
    if (mode !== "all") {
      const fg = mode === "fixM" ? "M" : "F";
      if (!ids.some((id) => gender(id) === fg && isAssigned(assign, id, k))) {
        toast(`고정할 ${fg === "M" ? "남자" : "여자"}가 조에 없어요. 먼저 직접 넣거나 이전 회차 편성을 불러오세요.`);
        return;
      }
    }
    const next = solveGroups({ people, k, met, mode, base: assign, avoid });
    commit({ k, assign: next });
    const mf = mixedMetPairs(next);
    toast(!avoid ? "랜덤으로 배정했어요" : mf ? `최대한 피했지만 남녀 재회 ${mf}쌍이 남았어요` : "전에 만난 이성과 겹치지 않게 배정했어요");
  };

  const changeK = (nk: number) => {
    if (nk < 2 || nk > 12) return;
    const next: Assign = { ...assign };
    let moved = 0;
    for (const id of Object.keys(next)) {
      const g = next[id];
      if (g != null && g >= nk) {
        next[id] = null;
        moved++;
      }
    }
    commit({ k: nk, assign: next });
    if (moved) toast(`${k}조에 있던 ${moved}명이 미배정으로 옮겨졌어요`);
  };

  const unassigned = ids.filter((id) => !isAssigned(assign, id, k));
  const um = unassigned.filter((id) => gender(id) === "M").sort((a, b) => koCompare(name(a), name(b)));
  const uf = unassigned.filter((id) => gender(id) === "F").sort((a, b) => koCompare(name(a), name(b)));

  return (
    <>
      <SessBar />
      <section className="settings">
        <div className="set">
          <span className="lbl">조 개수</span>
          <div className="stepper">
            <button type="button" aria-label="조 줄이기" disabled={k <= 2} onClick={() => changeK(k - 1)}>
              −
            </button>
            <output className="num">{k}조</output>
            <button type="button" aria-label="조 늘리기" disabled={k >= 12} onClick={() => changeK(k + 1)}>
              +
            </button>
          </div>
        </div>
        <div className="set">
          <span className="lbl">랜덤 방식</span>
          <Seg
            value={mode}
            onChange={setMode}
            label="랜덤 방식"
            options={[
              ["all", "남녀 모두 랜덤"],
              ["fixM", "남자 고정 · 여자만 랜덤"],
              ["fixF", "여자 고정 · 남자만 랜덤"],
            ]}
          />
        </div>
        <div className="set">
          <span className="lbl">겹침 방지</span>
          <label className="chk">
            <input type="checkbox" checked={avoid} onChange={(e) => setAvoid(e.target.checked)} /> 이전 회차에 같은 조였던 이성 피하기
          </label>
        </div>
        <div className="go">
          {prev && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                commit({ k: prev.groupCount, assign: Object.fromEntries(prev.assignments.map((a) => [a.memberId, a.group])) });
                toast(`${prev.no}회차 편성을 불러왔어요`);
              }}
            >
              {prev.no}회차 편성 불러오기
            </button>
          )}
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              commit({ k, assign: {} });
              toast("이 회차 조를 비웠어요");
            }}
          >
            모두 비우기
          </button>
          <button className="btn big" type="button" onClick={randomize}>
            랜덤 배정
          </button>
        </div>
        <p className="modehint">
          {HINT[mode]}{" "}
          {data.prior.length ? `겹침 비교 대상: ${data.prior.map((x) => `${x.no}회차`).join(", ")}.` : "이전 회차 편성이 없어 첫 편성입니다."}
        </p>
      </section>

      <div className="score">
        <div className={`sc ${score.mixedPairs ? "bad" : "good"}`}>
          <span className="lbl">전에 같은 조였던 남녀 쌍</span>
          <span className="val num">{score.mixedPairs}</span>
        </div>
        <div className="sc">
          <span className="lbl">같은 성별 재회</span>
          <span className="val num">{score.samePairs}</span>
        </div>
        <div className={`sc ${score.unassigned ? "bad" : "good"}`}>
          <span className="lbl">미배정</span>
          <span className="val num">{score.unassigned}명</span>
        </div>
      </div>

      <div className="groups">
        {gm.map((m, gi) => {
          const metIds = new Set<string>();
          let pairs = 0;
          for (let i = 0; i < m.length; i++)
            for (let j = i + 1; j < m.length; j++)
              if (met.has(pairKey(m[i], m[j])) && gender(m[i]) !== gender(m[j])) {
                pairs++;
                metIds.add(m[i]);
                metIds.add(m[j]);
              }
          return (
            <article key={gi} className={`grp ${pairs ? "warn" : ""}`}>
              <div className="hd">
                <span className="no">{gi + 1}조</span>
                <span className="cnt num">{m.length}명</span>
                <span className={`pill ${pairs ? "w" : "ok"}`}>{pairs ? `남녀 재회 ${pairs}쌍` : "이성 모두 새 만남"}</span>
              </div>
              {(["M", "F"] as const).map((g) => {
                const L = m.filter((id) => gender(id) === g).sort((a, b) => koCompare(name(a), name(b)));
                return (
                  <div className={`side ${g}`} key={g}>
                    <div className="sl">
                      <span>
                        {GN(g)} <span className="num">{L.length}</span>
                      </span>
                      <button type="button" onClick={() => setSheet({ kind: "add", gi, g })}>
                        + 추가
                      </button>
                    </div>
                    <div className="chips">
                      {L.length ? (
                        L.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className={`chip ${g} ${metIds.has(id) ? "met" : ""} ${fixG === g ? "pinned" : ""}`}
                            onClick={() => setSheet({ kind: "person", id })}
                          >
                            {name(id)}
                          </button>
                        ))
                      ) : (
                        <span className="none">아직 없음</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>

      <section className="pool">
        {unassigned.length ? (
          <>
            <h2>
              미배정 · 형제 {um.length} · 자매 {uf.length}
            </h2>
            {[um, uf]
              .filter((l) => l.length)
              .map((l, i) => (
                <div className="chips" key={i}>
                  {l.map((id) => (
                    <button key={id} type="button" className={`chip ${gender(id)}`} onClick={() => setSheet({ kind: "person", id })}>
                      {name(id)}
                    </button>
                  ))}
                </div>
              ))}
            <span className="hint">이름을 누르면 넣을 조를 고를 수 있어요.</span>
          </>
        ) : (
          <h2>미배정 없음 · 참여자 {ids.length}명 모두 배정됨</h2>
        )}
      </section>
      <p className="hint" style={{ margin: 0 }}>
        바꾸는 즉시 이 회차 편성으로 저장되고, 출석체크 카드에 조 번호가 표시됩니다. 이름을 누르면 다른 조로 옮기거나 뺄 수 있어요.
      </p>

      {sheet?.kind === "person" && byId.has(sheet.id) && (
        <PersonSheet
          id={sheet.id}
          name={name(sheet.id)}
          gender={gender(sheet.id)}
          k={k}
          current={isAssigned(assign, sheet.id, k) ? (assign[sheet.id] as number) : null}
          history={priors.filter((p) => p.assign[sheet.id] != null).map((p) => `${p.no}회차 ${(p.assign[sheet.id] as number) + 1}조`)}
          metNames={(gi) => metInGroup(sheet.id, gi).map(name)}
          onMove={(to) => {
            commit({ k, assign: { ...assign, [sheet.id]: to } });
            toast(to == null ? `${name(sheet.id)} 미배정` : `${name(sheet.id)} → ${to + 1}조`);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "add" && (
        <AddSheet
          gi={sheet.gi}
          g={sheet.g}
          candidates={ids
            .filter((id) => gender(id) === sheet.g && !isAssigned(assign, id, k))
            .map((id) => ({ id, name: name(id), met: metInGroup(id, sheet.gi).map(name) }))
            .sort((a, b) => a.met.length - b.met.length || koCompare(a.name, b.name))}
          onAdd={(list) => {
            const next = { ...assign };
            for (const id of list) next[id] = sheet.gi;
            commit({ k, assign: next });
            if (list.length) toast(`${sheet.gi + 1}조에 ${list.length}명 추가`);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

function PersonSheet({
  name,
  gender,
  k,
  current,
  history,
  metNames,
  onMove,
  onClose,
}: {
  id: string;
  name: string;
  gender: G;
  k: number;
  current: number | null;
  history: string[];
  metNames: (gi: number) => string[];
  onMove: (to: number | null) => void;
  onClose: () => void;
}) {
  const here = current != null ? metNames(current) : [];
  return (
    <Modal open onClose={onClose}>
      <ModalTitle>
        {name} <span className={`pill ${gender}`}>{GN(gender)}</span>
      </ModalTitle>
      <div className="hint">{history.length ? `지난 편성: ${history.join(" · ")}` : "지난 편성 없음"}</div>
      {here.length > 0 && (
        <div className="notice">
          <p>지금 조에서 전에 만난 이성: {here.join(", ")}</p>
        </div>
      )}
      <div className="gbtns">
        {Array.from({ length: k }, (_, gi) => {
          const n = metNames(gi).length;
          return (
            <button key={gi} type="button" aria-current={current === gi} onClick={() => onMove(gi)}>
              {gi + 1}조<small className={n ? "w" : ""}>{current === gi ? "현재" : n ? `재회 ${n}명` : "새 만남"}</small>
            </button>
          );
        })}
      </div>
      <div className="actions">
        {current != null && (
          <button className="btn ghost" type="button" onClick={() => onMove(null)}>
            미배정으로 빼기
          </button>
        )}
        <button className="btn" type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  );
}

function AddSheet({
  gi,
  g,
  candidates,
  onAdd,
  onClose,
}: {
  gi: number;
  g: G;
  candidates: { id: string; name: string; met: string[] }[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <Modal open onClose={onClose}>
      <ModalTitle>
        {gi + 1}조에 {GN(g)} 추가
      </ModalTitle>
      {candidates.length ? (
        <>
          <span className="hint">이 조 이성과 만난 적 없는 사람부터 보여줍니다.</span>
          <div className="plist">
            {candidates.map((c) => (
              <label className="pi" key={c.id}>
                <input
                  type="checkbox"
                  checked={picked.has(c.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(c.id);
                    else n.delete(c.id);
                    setPicked(n);
                  }}
                />
                <span className="nm">{c.name}</span>
                <span className={`ex ${c.met.length ? "w" : "ok"}`}>{c.met.length ? `재회: ${c.met.join(", ")}` : "새 만남"}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="notice">
          <p>미배정 {GN(g)}가 없어요.</p>
          <span className="hint">다른 조에 있는 사람은 이름을 눌러 이 조로 옮길 수 있어요.</span>
        </div>
      )}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          취소
        </button>
        {candidates.length > 0 && (
          <button className="btn" type="button" disabled={!picked.size} onClick={() => onAdd([...picked])}>
            {picked.size ? `${picked.size}명 추가` : "추가"}
          </button>
        )}
      </div>
    </Modal>
  );
}
