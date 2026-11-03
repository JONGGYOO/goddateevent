"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAM } from "@/components/admin";
import { GN, GenderPicker, Modal, ModalTitle, PlateFields, type G } from "@/components/kit";
import { errInfo } from "@/lib/errors";
import { MSG_PHONE, normalizePhone } from "@/lib/phone";
import { readPlateFields } from "@/lib/plate";

type Errs = { name?: string; phone?: string; car?: string; form?: string };

export function MemberEditor({
  member,
  initial,
  members,
  onClose,
}: {
  member: Doc<"members"> | null;
  initial?: { name?: string; gender?: G };
  members: Doc<"members">[];
  onClose: () => void;
}) {
  const router = useRouter();
  const create = useAM(api.members.create);
  const update = useAM(api.members.update);
  const remove = useAM(api.members.remove);
  const isNew = !member;

  const [name, setName] = useState(member?.name ?? initial?.name ?? "");
  const [gender, setGender] = useState<G>(member?.gender ?? initial?.gender ?? "M");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [church, setChurch] = useState(member?.church ?? "");
  const [cars, setCars] = useState<string[]>(member?.cars ?? []);
  const [memo, setMemo] = useState(member?.memo ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [errs, setErrs] = useState<Errs>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const others = members.filter((m) => m._id !== member?._id);

  const addCar = () => {
    const r = readPlateFields(front, back, true);
    if (r.error !== undefined) return setErrs({ ...errs, car: r.error });
    const plate = r.plate as string;
    if (cars.includes(plate)) return setErrs({ ...errs, car: "이미 추가한 차량이에요." });
    const owner = others.find((m) => m.cars.includes(plate));
    if (owner) return setErrs({ ...errs, car: `이미 ${owner.name}님 차량으로 등록된 번호예요.` });
    setCars([...cars, plate]);
    setFront("");
    setBack("");
    setErrs({ ...errs, car: undefined });
  };

  const save = async () => {
    const e: Errs = {};
    const n = name.trim();
    if (!n) e.name = "이름을 입력하세요.";
    const ph = phone.trim() ? normalizePhone(phone) : "";
    if (phone.trim() && !ph) e.phone = MSG_PHONE;
    else if (ph) {
      const o = others.find((m) => m.phone === ph);
      if (o) e.phone = `이미 ${o.name}님이 쓰는 번호예요.`;
    }
    if (front.trim() || back.trim()) e.car = "입력 중인 차량번호가 있어요. ‘추가’를 누르거나 지워 주세요.";
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const payload = { name: n, gender, phone: ph || undefined, church, cars, memo };
    try {
      if (member) {
        await update({ id: member._id, ...payload });
        toast(`${n}님 정보를 저장했어요`);
      } else {
        await create(payload);
        toast(`${n}님을 등록했어요`);
      }
      onClose();
    } catch (err) {
      const info = errInfo(err);
      setErrs(info.field === "name" || info.field === "phone" || info.field === "car" ? { [info.field]: info.message } : { form: info.message });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (id: Id<"members">) => {
    setBusy(true);
    try {
      await remove({ id });
      toast(`${member?.name}님을 삭제했어요`);
      onClose();
    } catch (err) {
      setErrs({ form: errInfo(err).message });
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose}>
      <ModalTitle>
        {isNew ? (
          "회원 등록"
        ) : (
          <>
            {member.name} <span className={`pill ${member.gender}`}>{GN(member.gender)}</span>
          </>
        )}
      </ModalTitle>
      <div className="sec">
        <h4>기본 정보</h4>
        <div className="field">
          <label htmlFor="fName">
            이름 <b>*</b>
          </label>
          <input
            id="fName"
            value={name}
            autoComplete="off"
            autoFocus={isNew}
            className={errs.name ? "bad" : ""}
            onChange={(e) => setName(e.target.value)}
          />
          {errs.name && <span className="errmsg">{errs.name}</span>}
        </div>
        <div className="field">
          <span className="lbl">
            성별 <b>*</b>
          </span>
          <GenderPicker value={gender} onChange={setGender} />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="fPhone">휴대폰</label>
            <input
              id="fPhone"
              inputMode="tel"
              placeholder="010-1234-5678"
              value={phone}
              className={`num ${errs.phone ? "bad" : ""}`}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                const n = normalizePhone(phone);
                if (n) setPhone(n);
              }}
            />
            {errs.phone && <span className="errmsg">{errs.phone}</span>}
          </div>
          <div className="field">
            <label htmlFor="fChurch">출석 교회</label>
            <input id="fChurch" placeholder="예: 은혜교회" value={church} onChange={(e) => setChurch(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="sec">
        <h4>차량</h4>
        {cars.length ? (
          <div className="carlist">
            {cars.map((c) => (
              <div className="ci" key={c}>
                <span className="plate">{c}</span>
                <button className="btn ghost sm" type="button" onClick={() => setCars(cars.filter((x) => x !== c))}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="hint">등록된 차량이 없어요.</span>
        )}
        <PlateFields front={front} back={back} onFront={setFront} onBack={setBack} onAdd={addCar} />
        {errs.car && <p className="errmsg">{errs.car}</p>}
      </div>
      <div className="sec">
        <h4>메모</h4>
        <div className="field">
          <textarea rows={2} placeholder="봉사 희망, 특이사항 등" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="메모" />
        </div>
      </div>
      {member && (
        <button
          className="btn ghost sm"
          type="button"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            onClose();
            router.push(`/stats?scope=all&q=${encodeURIComponent(member.name)}`);
          }}
        >
          참여 행사·출석률은 통계에서 보기 →
        </button>
      )}
      {errs.form && <p className="errmsg">{errs.form}</p>}
      {member && confirmDel ? (
        <div className="notice err">
          <p>{member.name}님을 삭제할까요? 모든 행사의 참여·조 편성·출석 기록도 함께 지워집니다.</p>
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => setConfirmDel(false)}>
              아니요
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => doDelete(member._id)}>
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {member && (
            <button className="btn danger l" type="button" onClick={() => setConfirmDel(true)}>
              회원 삭제
            </button>
          )}
          <button className="btn ghost" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn" type="button" onClick={save} disabled={busy}>
            {isNew ? "등록" : "저장"}
          </button>
        </div>
      )}
    </Modal>
  );
}
