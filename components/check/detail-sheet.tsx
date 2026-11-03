"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM } from "@/components/admin";
import { GN, Modal, ModalTitle, PlateFields } from "@/components/kit";
import { hm } from "@/lib/date";
import { errInfo } from "@/lib/errors";
import { maskPhone } from "@/lib/phone";
import { readPlateFields } from "@/lib/plate";
import type { Person } from "./types";

/** 출석한 사람 상세: 명찰·연락처(마스킹)·출석 시각, 차량 체크/등록, 출석 취소 */
export function DetailSheet({
  person,
  sessionId,
  sessionNo,
  device,
  allPeople,
  onClose,
}: {
  person: Person;
  sessionId: Id<"sessions">;
  sessionNo: number;
  device: "A" | "B";
  allPeople: Person[];
  onClose: () => void;
}) {
  const carIn = useAM(api.checkin.carIn);
  const carOut = useAM(api.checkin.carOut);
  const registerPlate = useAM(api.checkin.registerPlateAndCarIn);
  const cancel = useAM(api.checkin.cancelCheckIn);
  const [confirming, setConfirming] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const p = person;

  const togglePlate = async (plate: string) => {
    setBusy(true);
    try {
      if (p.car?.plate === plate) {
        await carOut({ sessionId, memberId: p.memberId, device });
        toast(`${plate} 도착 취소`);
      } else {
        await carIn({ sessionId, memberId: p.memberId, plate, device });
        toast(
          <span>
            <strong>{plate}</strong> 도착 · {p.name}
          </span>,
        );
      }
    } catch (e) {
      toast(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };

  const savePlate = async () => {
    const r = readPlateFields(front, back, true);
    if (r.error !== undefined) return setErr(r.error);
    const plate = r.plate as string;
    const owner = allPeople.find((x) => x.memberId !== p.memberId && x.cars.includes(plate));
    if (owner) return setErr(`이미 ${owner.name}님 차량으로 등록된 번호예요.`);
    setBusy(true);
    setErr("");
    try {
      await registerPlate({ sessionId, memberId: p.memberId, plate, device });
      setFront("");
      setBack("");
      toast(
        <span>
          <strong>{plate}</strong> 등록 · 도착 체크
        </span>,
      );
    } catch (e) {
      setErr(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose}>
      <ModalTitle>
        {p.name} <span className={`pill ${p.gender}`}>{GN(p.gender)}</span>
        {p.group && <span className="pill ac">{p.group}조</span>}
      </ModalTitle>
      <dl className="kv">
        <dt>명찰</dt>
        <dd className="num">{p.nameTagNo}번</dd>
        <dt>연락처</dt>
        <dd className="num">{p.phone ? maskPhone(p.phone) : "-"}</dd>
        <dt>출석</dt>
        <dd className="num">{p.att ? `${hm(p.att.at)} · 태블릿 ${p.att.device}` : "미출석"}</dd>
      </dl>
      <div className="carbox">
        {p.cars.length ? (
          <>
            <div className="hd">
              <span className="ttl">등록 차량</span>
            </div>
            {p.cars.map((plate) => {
              const on = p.car?.plate === plate;
              return (
                <button key={plate} className="toggle" type="button" aria-pressed={on} disabled={busy} onClick={() => togglePlate(plate)}>
                  <span className="plate">{plate}</span> {on && p.car ? `✓ 도착 ${hm(p.car.at)} · 눌러서 취소` : "도착 체크"}
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="hd">
              <span className="ttl">등록된 차량 없음 · 오늘 가져온 차량 입력</span>
            </div>
            <PlateFields front={front} back={back} onFront={setFront} onBack={setBack} onEnter={savePlate} />
            {err && <p className="errmsg">{err}</p>}
            <button className="btn" type="button" onClick={savePlate} disabled={busy}>
              차량 등록하고 도착 체크
            </button>
          </>
        )}
      </div>
      {confirming ? (
        <div className="notice err">
          <p>
            {p.name}님의 {sessionNo}회차 출석을 취소할까요?
          </p>
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => setConfirming(false)}>
              아니요
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancel({ sessionId, memberId: p.memberId, device });
                  toast(`${p.name} 출석을 취소했어요`);
                  onClose();
                } catch (e) {
                  toast(errInfo(e).message);
                  setBusy(false);
                }
              }}
            >
              출석 취소
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {p.att && (
            <button className="btn danger l" type="button" onClick={() => setConfirming(true)}>
              출석 취소
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      )}
    </Modal>
  );
}
