"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ } from "@/components/admin";
import { GN, Loading, Modal, ModalTitle } from "@/components/kit";
import { CHECK_MEMO, MAX_MEMO_TEXT } from "@/lib/codes";
import { hm } from "@/lib/date";
import { errInfo } from "@/lib/errors";
import type { Person } from "./types";

/** 출석 메모: 공통코드(출석 메모 그룹)를 골라 저장한다. 출석 처리는 하지 않는다 */
export function MemoSheet({
  person,
  sessionId,
  sessionNo,
  onClose,
}: {
  person: Person;
  sessionId: Id<"sessions">;
  sessionNo: number;
  onClose: () => void;
}) {
  const data = useAQ(api.codes.byKey, { key: CHECK_MEMO });
  const setMemo = useAM(api.checkin.setMemo);
  const ensure = useAM(api.codes.ensureSystemGroups);
  const p = person;
  const [picked, setPicked] = useState<Set<Id<"codes">>>(() => new Set(p.memo?.codes.map((c) => c._id) ?? []));
  const [text, setText] = useState(p.memo?.text ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: Id<"codes">) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async (clear = false) => {
    setBusy(true);
    setErr("");
    try {
      await setMemo({ sessionId, memberId: p.memberId, codeIds: clear ? [] : [...picked], text: clear ? "" : text });
      toast(clear || (!picked.size && !text.trim()) ? `${p.name} 메모를 지웠어요` : `${p.name} 메모를 저장했어요`);
      onClose();
    } catch (e) {
      setErr(errInfo(e).message);
      setBusy(false);
    }
  };

  // 사용 안 함 코드는 이미 골라 둔 경우에만 보여 준다
  const codes = data?.codes.filter((c) => c.active || picked.has(c._id)) ?? [];

  return (
    <Modal open onClose={onClose}>
      <ModalTitle>
        {p.name} <span className={`pill ${p.gender}`}>{GN(p.gender)}</span>
        <span className="pill off">{sessionNo}회차 메모</span>
      </ModalTitle>
      <p className="hint" style={{ margin: 0 }}>
        해당하는 항목을 눌러 고르세요. 메모만 저장되고 출석 처리는 되지 않아요.
        {p.memo && ` 마지막 저장: ${hm(p.memo.at)}`}
      </p>
      {data === undefined ? (
        <Loading />
      ) : data === null ? (
        <div className="notice">
          <p>출석 메모 코드가 아직 없어요.</p>
          <div className="actions">
            <Link className="btn ghost sm" href="/codes">
              공통코드 화면으로
            </Link>
            <button
              className="btn sm"
              type="button"
              onClick={() => ensure({}).catch((e) => toast(errInfo(e).message))}
            >
              기본 코드 만들기
            </button>
          </div>
        </div>
      ) : (
        <div className="codepick" role="group" aria-label="메모 코드">
          {codes.length ? (
            codes.map((c) => (
              <button key={c._id} type="button" className="codechip" aria-pressed={picked.has(c._id)} onClick={() => toggle(c._id)}>
                {c.label}
              </button>
            ))
          ) : (
            <span className="hint">
              쓸 수 있는 코드가 없어요. <Link href="/codes">공통코드</Link>에서 ‘{data.group.name}’ 코드를 추가하세요.
            </span>
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor="memoText">덧붙일 말 (선택)</label>
        <input
          id="memoText"
          maxLength={MAX_MEMO_TEXT}
          autoComplete="off"
          placeholder="코드로 부족할 때만 짧게"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </div>
      {err && <p className="errmsg">{err}</p>}
      <div className="actions">
        {p.memo && (
          <button className="btn danger l" type="button" disabled={busy} onClick={() => save(true)}>
            메모 지우기
          </button>
        )}
        <button className="btn ghost" type="button" onClick={onClose}>
          취소
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => save()}>
          저장
        </button>
      </div>
    </Modal>
  );
}
