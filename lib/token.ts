// 관리자 세션 토큰: base64url(exp) + "." + base64url(HMAC_SHA256(secret, exp))
// Next(proxy, route handler)와 Convex 함수가 같은 코드로 검증한다. Web Crypto만 사용.

export const SESSION_COOKIE = "gd_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간: 행사 당일 하루 버티게

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signToken(secret: string, now: number = Date.now()): Promise<string> {
  const exp = String(now + SESSION_TTL_MS);
  return `${b64url(enc.encode(exp))}.${b64url(await hmac(secret, exp))}`;
}

/** 서명과 만료를 확인한다. 유효하면 true */
export async function verifyToken(
  secret: string | undefined,
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!secret || !token) return false;
  const [p, s] = token.split(".");
  if (!p || !s) return false;
  const expBytes = fromB64url(p);
  const sig = fromB64url(s);
  if (!expBytes || !sig) return false;
  const exp = new TextDecoder().decode(expBytes);
  if (!/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return sameBytes(sig, await hmac(secret, exp));
}
