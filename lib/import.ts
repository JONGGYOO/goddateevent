import { normalizePhone } from "./phone";
import { normalizePlate } from "./plate";

export type ImportRow = {
  name: string;
  gender: "M" | "F" | null;
  phone: string; // 정규화된 번호 또는 원문
  phoneOk: string | null;
  church: string;
  plate: string | null;
  raw: string[];
  status: "ok" | "dup" | "bad";
  errs: string[];
};

/**
 * 엑셀 붙여넣기(TSV) 또는 CSV → 미리보기 행.
 * 열 순서: 이름* · 성별*(남/여) · 휴대폰 · 교회 · 차량번호. 첫 줄이 "이름"으로 시작하면 헤더로 무시.
 */
export function parseImport(text: string, existingPhones: Set<string>, existingPlates: Set<string>): ImportRow[] {
  const lines = text
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  let rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "").trim()));
  if (/^이름/.test(rows[0][0] ?? "")) rows = rows.slice(1);
  const seenPhones = new Set<string>();
  const seenPlates = new Set<string>();
  return rows.map((r) => {
    const [name = "", g = "", p = "", church = "", car = ""] = r;
    const errs: string[] = [];
    const gender = /^(남|M|m|형제|남자)$/.test(g) ? "M" : /^(여|F|f|자매|여자)$/.test(g) ? "F" : null;
    if (!name) errs.push("이름 없음");
    if (!gender) errs.push("성별은 남/여");
    const phoneOk = p ? normalizePhone(p) : null;
    if (p && !phoneOk) errs.push("휴대폰 형식");
    let plate: string | null = null;
    if (car) {
      plate = normalizePlate(car);
      if (!plate) errs.push("차량번호 형식");
      else if (existingPlates.has(plate) || seenPlates.has(plate)) errs.push("차량 중복");
    }
    let status: ImportRow["status"] = errs.length ? "bad" : "ok";
    if (status === "ok" && phoneOk && (existingPhones.has(phoneOk) || seenPhones.has(phoneOk))) {
      status = "dup";
      errs.push("같은 번호 회원 있음");
    }
    if (phoneOk) seenPhones.add(phoneOk);
    if (plate && status === "ok") seenPlates.add(plate);
    return { name, gender, phone: phoneOk ?? p, phoneOk, church, plate, raw: r, status, errs };
  });
}

export const IMPORT_SAMPLE =
  "이름\t성별\t휴대폰\t교회\t차량번호\n도하람\t여\t010-3344-1290\t한빛교회\t52가 1188\n변승리\t남\t01077120934\t새소망교회\t\n주예진\t여\t\t\t\n탁요한\t남\t010-7712-0934\t은혜교회\t\n성다솜\t\t010-2210-6543\t생명샘교회\t\n이사무엘\t남\t\t은혜교회\t19저20";
