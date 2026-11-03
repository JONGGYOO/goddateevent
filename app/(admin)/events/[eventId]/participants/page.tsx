"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ } from "@/components/admin";
import { G_OPTIONS, GN, Hl, Loading, Modal, ModalTitle, SearchBox, Seg, countNames, type G, type GFilter } from "@/components/kit";
import { useEvent } from "@/components/events/event-context";
import { koCompare, matchAt } from "@/lib/hangul";
import { errInfo } from "@/lib/errors";

type Removing = { memberId: Id<"members">; name: string; attended: number } | null;

export default function ParticipantsTab() {
  const { eventId } = useEvent();
  const parts = useAQ(api.participants.listByEvent, { eventId });
  const pool = useAQ(api.participants.pool, { eventId });
  const addMany = useAM(api.participants.addMany);
  const removeP = useAM(api.participants.remove);
  const [g, setG] = useState<GFilter>("ALL");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<Id<"members">>>(new Set());
  const [removing, setRemoving] = useState<Removing>(null);
  const [busy, setBusy] = useState(false);

  const qn = q.replace(/\s+/g, "");
  const dup = useMemo(() => countNames([...(pool ?? []), ...(parts ?? [])].map((m) => m.name)), [pool, parts]);
  const cand = useMemo(
    () =>
      (pool ?? [])
        .filter((m) => (g === "ALL" || m.gender === g) && (!qn || matchAt(m.name, qn) >= 0))
        .sort((a, b) => (a.gender === b.gender ? koCompare(a.name, b.name) : a.gender === "M" ? -1 : 1)),
    [pool, g, qn],
  );
  // 화면에 남아 있는 사람만 선택 수에 넣는다
  const poolIds = useMemo(() => new Set((pool ?? []).map((m) => m._id)), [pool]);
  const selected = [...picked].filter((id) => poolIds.has(id));

  const byG = (gg: G) => (parts ?? []).filter((p) => p.gender === gg).sort((a, b) => koCompare(a.name, b.name));
  const M = byG("M");
  const F = byG("F");

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await addMany({ eventId, memberIds: selected });
      setPicked(new Set());
      toast(`${r.added}명을 참여 인원으로 확정했어요`);
    } catch (e) {
      toast(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (memberId: Id<"members">, name: string) => {
    try {
      await removeP({ eventId, memberId });
      toast(`${name}님을 참여 인원에서 뺐어요`);
    } catch (e) {
      toast(errInfo(e).message);
    }
  };

  return (
    <>
      <p className="hint" style={{ margin: 0 }}>
        회원 명부에서 이 행사에 참여할 사람을 골라 확정합니다. 확정한 인원만 조 편성과 출석체크 명단에 나옵니다.
      </p>
      <div className="two">
        <section className="box pane">
          <h2>회원 명부에서 선택</h2>
          <div className="controls">
            <Seg value={g} options={G_OPTIONS} onChange={setG} label="성별" />
            <SearchBox value={q} onChange={setQ} placeholder="이름·초성 검색" />
          </div>
          <div className="controls">
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => setPicked(new Set([...selected, ...cand.map((m) => m._id)]))}
              disabled={!cand.length}
            >
              보이는 사람 모두 선택
            </button>
            {selected.length > 0 && (
              <button className="btn ghost sm" type="button" onClick={() => setPicked(new Set())}>
                선택 해제
              </button>
            )}
            <span className="spacer" />
            <button className="btn" type="button" disabled={!selected.length || busy} onClick={confirm}>
              선택한 {selected.length}명 참여 확정
            </button>
          </div>
          <div className="plist">
            {!pool ? (
              <Loading />
            ) : cand.length ? (
              cand.map((m) => (
                <label className="pi" key={m._id}>
                  <input
                    type="checkbox"
                    checked={picked.has(m._id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(m._id);
                      else next.delete(m._id);
                      setPicked(next);
                    }}
                  />
                  <span className={`dot ${m.gender}`} />
                  <span className="nm">
                    <Hl text={m.name} q={qn} />
                  </span>
                  {(dup.get(m.name) ?? 0) > 1 && <span className="hint num">{m.phone ? m.phone.slice(-4) : (m.church ?? "")}</span>}
                  <span className={`ex ${m.history.length ? "" : "ok"}`}>
                    {m.history.length ? m.history.map((n) => `제${n}회`).join(" · ") : "첫 참여"}
                  </span>
                </label>
              ))
            ) : (
              <div className="empty flat">
                <span className="hint">{q ? "검색 결과가 없어요." : "선택할 회원이 없어요. 모두 참여 중이거나 명부가 비어 있습니다."}</span>
              </div>
            )}
          </div>
        </section>

        <section className="box pane">
          <h2>
            참여 확정 인원 <span className="pill M">남 {M.length}</span>
            <span className="pill F">여 {F.length}</span>
            {M.length !== F.length && M.length + F.length > 0 && <span className="pill w">남녀 {Math.abs(M.length - F.length)}명 차이</span>}
          </h2>
          {!parts ? (
            <Loading />
          ) : parts.length ? (
            (["M", "F"] as const).map((gg) => {
              const L = gg === "M" ? M : F;
              return (
                <div className={`roster ${gg}`} key={gg}>
                  <h3>
                    {GN(gg)} {L.length}명
                  </h3>
                  <div className="rchips">
                    {L.length ? (
                      L.map((p) => (
                        <span className={`rchip ${gg}`} key={p._id}>
                          {p.name}
                          <button
                            type="button"
                            aria-label={`${p.name} 빼기`}
                            onClick={() =>
                              p.attended ? setRemoving({ memberId: p.memberId, name: p.name, attended: p.attended }) : doRemove(p.memberId, p.name)
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="hint">아직 없음</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty flat">
              <span className="hint">왼쪽에서 참여자를 골라 확정하세요.</span>
            </div>
          )}
        </section>
      </div>

      {removing && (
        <Modal open onClose={() => setRemoving(null)}>
          <ModalTitle>{removing.name}님을 뺄까요?</ModalTitle>
          <div className="notice">
            <p>이미 {removing.attended}번 출석한 기록이 있어요.</p>
            <span className="hint">빼면 조 편성에서도 빠집니다. 출석 기록은 남지만 이 행사 명단에는 보이지 않아요.</span>
          </div>
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => setRemoving(null)}>
              취소
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                const r = removing;
                setRemoving(null);
                doRemove(r.memberId, r.name);
              }}
            >
              빼기
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
