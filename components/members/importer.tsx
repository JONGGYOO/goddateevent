"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAM } from "@/components/admin";
import { Modal, ModalTitle } from "@/components/kit";
import { errInfo } from "@/lib/errors";
import { IMPORT_SAMPLE, parseImport } from "@/lib/import";

export function Importer({ members, onClose }: { members: Doc<"members">[]; onClose: () => void }) {
  const importMany = useAM(api.members.importMany);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const phones = useMemo(() => new Set(members.map((m) => m.phone).filter((p): p is string => !!p)), [members]);
  const plates = useMemo(() => new Set(members.flatMap((m) => m.cars)), [members]);
  const rows = useMemo(() => parseImport(text, phones, plates), [text, phones, plates]);
  const ok = rows.filter((r) => r.status === "ok");

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await importMany({
        rows: ok.map((r) => ({
          name: r.name,
          gender: r.gender as "M" | "F",
          phone: r.phoneOk ?? undefined,
          church: r.church || undefined,
          car: r.plate ?? undefined,
        })),
      });
      toast(
        `${res.added}명을 등록했어요${res.skipped || res.failed ? ` · 건너뜀 ${res.skipped + res.failed}명 (그사이 같은 번호·차량이 생겼어요)` : ""}`,
      );
      onClose();
    } catch (e) {
      setError(errInfo(e).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide>
      <ModalTitle>엑셀로 일괄 등록</ModalTitle>
      <div className="cols">
        엑셀에서 아래 순서의 열을 복사해 붙여넣거나 CSV 파일을 고르세요.
        <br />
        <code>이름* · 성별*(남/여) · 휴대폰 · 교회 · 차량번호</code> (* 필수)
      </div>
      <div className="field">
        <label htmlFor="imText">붙여넣기</label>
        <textarea id="imText" className="paste" placeholder="여기에 붙여넣기" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <label className="btn ghost sm" htmlFor="imFile">
          CSV 파일 선택
        </label>
        <input
          type="file"
          id="imFile"
          accept=".csv,.tsv,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fr = new FileReader();
            fr.onload = () => setText(String(fr.result ?? ""));
            fr.readAsText(f, "utf-8");
            e.target.value = "";
          }}
        />
        <button className="btn ghost sm" type="button" onClick={() => setText(IMPORT_SAMPLE)}>
          예시 데이터 넣기
        </button>
      </div>
      {rows.length > 0 && (
        <div className="sec">
          <h4>
            미리보기 · 등록 가능 {ok.length}명 / {rows.length}행
          </h4>
          <div className="prev">
            <table>
              <thead>
                <tr>
                  <th>상태</th>
                  <th>이름</th>
                  <th>성별</th>
                  <th>휴대폰</th>
                  <th>교회</th>
                  <th>차량</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`pill ${r.status === "ok" ? "ok" : r.status === "dup" ? "w" : "err"}`}>
                        {r.status === "ok" ? "등록" : r.status === "dup" ? "건너뜀" : "오류"}
                      </span>{" "}
                      <span className="hint">{r.errs.join(", ")}</span>
                    </td>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td>{r.gender ? <span className={`pill ${r.gender}`}>{r.gender === "M" ? "남" : "여"}</span> : r.raw[1]}</td>
                    <td className="num">{r.phone}</td>
                    <td>{r.church}</td>
                    <td>{r.plate ? <span className="plate">{r.plate}</span> : r.raw[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <p className="errmsg">{error}</p>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          취소
        </button>
        <button className="btn" type="button" disabled={!ok.length || busy} onClick={go}>
          {ok.length}명 등록
        </button>
      </div>
    </Modal>
  );
}
