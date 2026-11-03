// 한글 초성 검색. "ㄱㅁㅅ" → 김민수, "ㄱ민ㅅ" 같은 혼합 입력도 허용한다.
export const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

const isCho = (c: string) => CHO.includes(c);

/** 완성형 한글이면 초성, 아니면 글자 그대로 */
export function choOf(c: string): string {
  const k = c.charCodeAt(0) - 0xac00;
  return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c;
}

/** 이름에서 검색어가 시작하는 위치. 없으면 -1. 공백은 무시한다. */
export function matchAt(name: string, query: string): number {
  const q = query.replace(/\s+/g, "");
  if (!q) return 0;
  for (let s = 0; s + q.length <= name.length; s++) {
    let ok = true;
    for (let j = 0; j < q.length; j++) {
      const n = name[s + j];
      const c = q[j];
      if (isCho(c) ? choOf(n) !== c : n !== c) {
        ok = false;
        break;
      }
    }
    if (ok) return s;
  }
  return -1;
}

/** 하이라이트용 조각: [앞, 일치, 뒤] */
export function splitMatch(name: string, query: string): [string, string, string] | null {
  const q = query.replace(/\s+/g, "");
  if (!q) return null;
  const at = matchAt(name, q);
  if (at < 0) return null;
  return [name.slice(0, at), name.slice(at, at + q.length), name.slice(at + q.length)];
}

/** 검색어에서 자음만 있는 글자를 지운다 (현장 등록 시 이름 미리 채우기용) */
export const stripCho = (s: string) => s.replace(/[ㄱ-ㅎ]/g, "");

export const koCompare = (a: string, b: string) => a.localeCompare(b, "ko");
