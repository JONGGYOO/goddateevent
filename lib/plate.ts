// 차량번호: 앞자리 "19저"/"123가" + 뒷자리 "2074" → 저장 형식 "19저 2074"
export const FRONT_RE = /^\d{2,3}[가-힣]$/;
export const BACK_RE = /^\d{4}$/;

export const MSG_FRONT = "앞자리는 숫자 2~3자리와 한글 한 글자예요. 예: 19저, 123가";
export const MSG_BACK = "뒷자리는 숫자 4자리로 입력하세요. 예: 2074";
export const MSG_PLATE_REQUIRED = "차량번호를 입력하세요. 예: 19저 2074";

export const validateFront = (s: string) => FRONT_RE.test(s.replace(/\s/g, ""));
export const validateBack = (s: string) => BACK_RE.test(s.replace(/\s/g, ""));

/** "19저2074", "19저 2074" → "19저 2074". 형식이 틀리면 null */
export function normalizePlate(s: string | null | undefined): string | null {
  const m = String(s ?? "")
    .replace(/\s/g, "")
    .match(/^(\d{2,3}[가-힣])(\d{4})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export type PlateResult = { plate: string | null; error?: undefined } | { plate?: undefined; error: string };

/** 두 칸 입력값 검증. required=false면 둘 다 비었을 때 plate=null */
export function readPlateFields(front: string, back: string, required: boolean): PlateResult {
  const f = front.replace(/\s/g, "");
  const b = back.replace(/\s/g, "");
  if (!f && !b) return required ? { error: MSG_PLATE_REQUIRED } : { plate: null };
  if (!FRONT_RE.test(f)) return { error: MSG_FRONT };
  if (!BACK_RE.test(b)) return { error: MSG_BACK };
  return { plate: `${f} ${b}` };
}

export const plateDigits = (p: string) => p.replace(/\D/g, "");
export const plateTail = (p: string) => p.slice(-4);
export const plateHead = (p: string) => p.slice(0, -4);
