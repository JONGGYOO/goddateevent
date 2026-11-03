"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ, useToday } from "@/components/admin";
import { Loading } from "@/components/kit";
import { errInfo } from "@/lib/errors";
import { fmtSession } from "@/lib/date";

type EvRow = NonNullable<ReturnType<typeof useEventsList>>[number];
function useEventsList(today: string) {
  return useAQ(api.events.list, { today });
}

export default function EventsPage() {
  const today = useToday();
  const events = useEventsList(today);
  const router = useRouter();
  const create = useAM(api.events.create);
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<Id<"events"> | null>(null);
  const [delId, setDelId] = useState<Id<"events"> | null>(null);

  const nextNo = (events ?? []).reduce((m, e) => Math.max(m, e.no), 0) + 1;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = no ? Number(no) : undefined;
    if (!name.trim()) return setErr({ field: "name", message: "행사 이름을 입력하세요." });
    setBusy(true);
    setErr(null);
    try {
      const r = await create({ no: n, name });
      setNo("");
      setName("");
      toast(`제${r.no}회 ${r.name}를 등록했어요. 눌러서 참여 인원을 고르세요.`);
    } catch (e2) {
      setErr(errInfo(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>행사관리</h1>
          <span className="sub">행사를 만들고, 행사를 눌러 회차 · 참여 인원 · 조 편성 · 출석체크를 진행합니다.</span>
        </div>
      </div>
      <form className="inform" onSubmit={submit} noValidate autoComplete="off">
        <div className="field">
          <label htmlFor="evNo">
            회차 <b>*</b>
          </label>
          <div className={`unit ${err?.field === "no" ? "bad" : ""}`}>
            <span>제</span>
            <input
              id="evNo"
              inputMode="numeric"
              maxLength={3}
              placeholder={String(nextNo)}
              value={no}
              onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))}
            />
            <span>회</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="evName">
            행사 이름 <b>*</b>
          </label>
          <input
            id="evName"
            maxLength={40}
            placeholder="예: 겨울 갓데이트"
            value={name}
            className={err?.field === "name" ? "bad" : ""}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={busy}>
          행사 등록
        </button>
        {err && <p className="errline">{err.message}</p>}
      </form>

      {!events ? (
        <Loading />
      ) : (
        <div className="box list">
          {events.length ? (
            events.map((e) =>
              editId === e._id ? (
                <EditRow key={e._id} ev={e} onDone={() => setEditId(null)} />
              ) : delId === e._id ? (
                <DeleteRow key={e._id} ev={e} onDone={() => setDelId(null)} />
              ) : (
                <div
                  key={e._id}
                  className="it go"
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/events/${e._id}/participants`)}
                  onKeyDown={(k) => {
                    if (k.key === "Enter" && k.target === k.currentTarget) router.push(`/events/${e._id}/participants`);
                  }}
                >
                  <span className={`badge ${e.next ? "" : "off"}`}>제{e.no}회</span>
                  <div>
                    <div className="t1">{e.name}</div>
                    <div className="t2">
                      <span>
                        회차 {e.sessionCount}개
                        {e.firstDate && e.lastDate ? ` · ${fmtSession(e.firstDate)} ~ ${fmtSession(e.lastDate)}` : ""}
                      </span>
                      <span>
                        참여 남 {e.male} · 여 {e.female}
                      </span>
                      <span>
                        {!e.sessionCount ? "회차 없음" : e.next ? `다음: ${e.next.no}회차 ${fmtSession(e.next.date)}` : `종료 · ${e.done}회 진행`}
                      </span>
                    </div>
                  </div>
                  <div className="acts" onClick={(x) => x.stopPropagation()} onKeyDown={(x) => x.stopPropagation()}>
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => {
                        setEditId(e._id);
                        setDelId(null);
                      }}
                    >
                      수정
                    </button>
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => {
                        setDelId(e._id);
                        setEditId(null);
                      }}
                    >
                      삭제
                    </button>
                    <button className="btn sm" type="button" onClick={() => router.push(`/events/${e._id}/participants`)}>
                      열기
                    </button>
                  </div>
                </div>
              ),
            )
          ) : (
            <div className="empty flat">아직 등록된 행사가 없어요. 위에서 첫 행사를 등록하세요.</div>
          )}
        </div>
      )}
      <div className="foot">
        <span>최근 행사가 위에 표시됩니다.</span>
      </div>
    </>
  );
}

function EditRow({ ev, onDone }: { ev: EvRow; onDone: () => void }) {
  const update = useAM(api.events.update);
  const [no, setNo] = useState(String(ev.no));
  const [name, setName] = useState(ev.name);
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      await update({ id: ev._id, no: Number(no || 0), name });
      toast("저장했어요");
      onDone();
    } catch (e) {
      setErr(errInfo(e).message);
    }
  };
  return (
    <div className="it edit">
      <div className="field">
        <label htmlFor="eNo">회차</label>
        <div className="unit">
          <span>제</span>
          <input id="eNo" inputMode="numeric" maxLength={3} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} />
          <span>회</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="eName">행사 이름</label>
        <input
          id="eName"
          maxLength={40}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </div>
      <div className="acts">
        <button className="btn ghost sm" type="button" onClick={onDone}>
          취소
        </button>
        <button className="btn sm" type="button" onClick={save}>
          저장
        </button>
      </div>
      {err && <p className="errline">{err}</p>}
    </div>
  );
}

function DeleteRow({ ev, onDone }: { ev: EvRow; onDone: () => void }) {
  const remove = useAM(api.events.remove);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="it conf">
      <span className="badge">제{ev.no}회</span>
      <div>
        <div className="t1">‘{ev.name}’을 삭제할까요?</div>
        <div className="t2">회차 {ev.sessionCount}개와 참여 인원, 조 편성, 출석 기록이 함께 지워집니다.</div>
        {err && <p className="errmsg">{err}</p>}
      </div>
      <div className="acts">
        <button className="btn ghost sm" type="button" onClick={onDone}>
          아니요
        </button>
        <button
          className="btn danger sm"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await remove({ id: ev._id });
              toast(`제${ev.no}회 ${ev.name}를 삭제했어요`);
              onDone();
            } catch (e) {
              setErr(errInfo(e).message);
              setBusy(false);
            }
          }}
        >
          삭제
        </button>
      </div>
    </div>
  );
}
