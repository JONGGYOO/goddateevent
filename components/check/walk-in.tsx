"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM } from "@/components/admin";
import { GenderPicker, Modal, ModalTitle, PlateFields, type G } from "@/components/kit";
import { errInfo } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { readPlateFields } from "@/lib/plate";

/** 현장 등록: 회원 생성 + 참여자 추가 + 출석 (+ 차량 도착) */
export function WalkIn({
  sessionId,
  sessionNo,
  device,
  initialName,
  initialGender,
  onClose,
}: {
  sessionId: Id<"sessions">;
  sessionNo: number;
  device: "A" | "B";
  initialName: string;
  initialGender: G;
  onClose: () => void;
}) {
  const walkIn = useAM(api.checkin.walkIn);
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<G>(initialGender);
  const [phone, setPhone] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) return setErr("이름을 입력하세요.");
    if (phone.trim() && !normalizePhone(phone)) return setErr("휴대폰은 010으로 시작하는 11자리로 입력하세요. 비워 둬도 됩니다.");
    const r = readPlateFields(front, back, false);
    if (r.error !== undefined) return setErr(r.error);
    setBusy(true);
    setErr("");
    try {
      const res = await walkIn({
        sessionId,
        name: n,
        gender,
        phone: phone.trim() || undefined,
        plate: r.plate ?? undefined,
        device,
      });
      toast(
        <span>
          <strong>{res.name}</strong> 현장 등록 · 출석 · 명찰 {res.nameTagNo}번
        </span>,
      );
      onClose();
    } catch (e) {
      setErr(errInfo(e).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose}>
      <ModalTitle>현장 등록</ModalTitle>
      <p className="hint" style={{ margin: 0 }}>
        회원 명부에 등록하고, 이 행사 참여 인원에 넣고, {sessionNo}회차 출석까지 한 번에 처리합니다.
      </p>
      <div className="field">
        <label htmlFor="wName">
          이름 <b>*</b>
        </label>
        <input id="wName" value={name} autoComplete="off" autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="lbl">
          성별 <b>*</b>
        </span>
        <GenderPicker value={gender} onChange={setGender} />
      </div>
      <div className="field">
        <label htmlFor="wPhone">휴대폰 (선택)</label>
        <input id="wPhone" inputMode="tel" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <span className="lbl">오늘 가져온 차량번호 (선택) · 입력하면 도착 체크까지 됩니다</span>
        <PlateFields front={front} back={back} onFront={setFront} onBack={setBack} onEnter={submit} />
      </div>
      {err && <p className="errmsg">{err}</p>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          취소
        </button>
        <button className="btn" type="button" onClick={submit} disabled={busy}>
          등록하고 출석
        </button>
      </div>
    </Modal>
  );
}
