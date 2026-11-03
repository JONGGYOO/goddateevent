"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM } from "@/components/admin";
import { Modal, ModalTitle } from "@/components/kit";
import { useEvent, type SessionRow } from "@/components/events/event-context";
import { addDays, fmtSession } from "@/lib/date";
import { errInfo } from "@/lib/errors";

export default function SessionsTab() {
  const { eventId, overview, today, hrefFor } = useEvent();
  const router = useRouter();
  const create = useAM(api.sessions.create);
  const remove = useAM(api.sessions.remove);
  const ss = overview.sessions;
  const def = ss.length ? addDays(ss[ss.length - 1].date, 7) : today;
  const [date, setDate] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [delId, setDelId] = useState<Id<"sessions"> | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const value = date ?? def;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value) return setErr("날짜를 고르세요.");
    if (ss.some((s) => s.date === value)) return setErr(`${fmtSession(value)}에는 이미 회차가 있어요.`);
    setErr("");
    try {
      const r = await create({ eventId, date: value });
      setDate(null);
      toast(`${r.no}회차 ${fmtSession(value)}를 추가했어요`);
    } catch (e2) {
      setErr(errInfo(e2).message);
    }
  };

  return (
    <>
      <form className="inform" onSubmit={submit} noValidate style={{ gridTemplateColumns: "minmax(0,260px) minmax(0,1fr) auto" }}>
        <div className="field">
          <label htmlFor="sDate">
            회차 날짜 <b>*</b>
          </label>
          <input id="sDate" type="date" value={value} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="hint wide" style={{ margin: "0 0 14px" }}>
          회차 번호는 날짜 순서로 자동으로 매겨집니다. 보통 매주 같은 요일이라 마지막 회차의 일주일 뒤가 기본값이에요.
        </p>
        <button className="btn" type="submit">
          회차 추가
        </button>
        {err && <p className="errline">{err}</p>}
      </form>

      <div className="box list">
        {ss.length ? (
          ss.map((s) => {
            const past = s.date < today;
            const status = past ? (
              <span className="pill off">지난 회차</span>
            ) : s.date === today ? (
              <span className="pill ok">오늘</span>
            ) : (
              <span className="pill ac">예정</span>
            );
            if (delId === s._id)
              return (
                <div className="it conf" key={s._id}>
                  <span className="badge">{s.no}회차</span>
                  <div>
                    <div className="t1">{fmtSession(s.date)} 회차를 삭제할까요?</div>
                    <div className="t2">
                      이 회차의 조 편성과 출석 기록 {s.attendanceTotal}건이 함께 지워지고, 뒤 회차 번호가 앞당겨집니다.
                    </div>
                  </div>
                  <div className="acts">
                    <button className="btn ghost sm" type="button" onClick={() => setDelId(null)}>
                      아니요
                    </button>
                    <button
                      className="btn danger sm"
                      type="button"
                      onClick={async () => {
                        try {
                          await remove({ id: s._id });
                          setDelId(null);
                          toast("회차를 삭제했어요");
                        } catch (e) {
                          toast(errInfo(e).message);
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            return (
              <div className="it" key={s._id}>
                <span className={`badge ${past ? "off" : ""}`}>{s.no}회차</span>
                <div>
                  <div className="t1">
                    {fmtSession(s.date)} {status}
                  </div>
                  <div className="t2">
                    <span>
                      출석 {s.attended}/{overview.participantCount}명
                    </span>
                    <span>{s.groupCount ? `조 편성 ${s.groupCount}개 조` : "조 미편성"}</span>
                    <span>차량 {s.cars}대</span>
                  </div>
                </div>
                <div className="acts">
                  <button className="btn ghost sm" type="button" onClick={() => setEditing(s)}>
                    날짜 변경
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => setDelId(s._id)}>
                    삭제
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => router.push(hrefFor("groups", s._id))}>
                    조 편성
                  </button>
                  <button className="btn sm" type="button" onClick={() => router.push(hrefFor("check", s._id))}>
                    출석체크
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty flat">
            <strong>아직 회차가 없어요</strong>
            <span className="hint">위에서 첫 회차 날짜를 추가하세요. 1~5회 정도 진행하는 행사라면 5번 추가하면 됩니다.</span>
          </div>
        )}
      </div>
      {editing && <DateEditor session={editing} others={ss} onClose={() => setEditing(null)} />}
    </>
  );
}

function DateEditor({ session, others, onClose }: { session: SessionRow; others: SessionRow[]; onClose: () => void }) {
  const updateDate = useAM(api.sessions.updateDate);
  const [d, setD] = useState(session.date);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!d) return setErr("날짜를 고르세요.");
    if (others.some((x) => x.date === d && x._id !== session._id)) return setErr("그날에는 이미 회차가 있어요.");
    try {
      await updateDate({ id: session._id, date: d });
      toast("날짜를 바꿨어요. 회차 번호는 날짜 순서로 다시 매겨집니다.");
      onClose();
    } catch (e) {
      setErr(errInfo(e).message);
    }
  };
  return (
    <Modal open onClose={onClose}>
      <ModalTitle>{session.no}회차 날짜 변경</ModalTitle>
      <div className="field">
        <label htmlFor="nd">날짜</label>
        <input id="nd" type="date" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      {err && <p className="errmsg">{err}</p>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          취소
        </button>
        <button className="btn" type="button" onClick={save}>
          저장
        </button>
      </div>
    </Modal>
  );
}
