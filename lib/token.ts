// 세션 토큰: base64url(payload) + "." + base64url(HMAC_SHA256(secret, payload)), payload = "exp.role"
// role: admin(모든 기능) / staff(조회 + 출석체크만). 예전 토큰(payload = exp)은 admin으로 본다.
// Next(proxy, route handler)와 Convex 함수가 같은 코드로 검증한다. Web Crypto만 사용.

export const SESSION_COOKIE = "gd_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간: 행사 당일 하루 버티게

export type Role = "admin" | "staff";

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

export async function signToken(secret: string, role: Role = "admin", now: number = Date.now()): Promise<string> {
  const payload = `${now + SESSION_TTL_MS}.${role}`;
  return `${b64url(enc.encode(payload))}.${b64url(await hmac(secret, payload))}`;
}

/** 서명과 만료를 확인한다. 유효하면 역할, 아니면 null */
export async function verifyToken(
  secret: string | undefined,
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<Role | null> {
  if (!secret || !token) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  const payloadBytes = fromB64url(p);
  const sig = fromB64url(s);
  if (!payloadBytes || !sig) return null;
  const payload = new TextDecoder().decode(payloadBytes);
  const m = /^(\d+)(?:\.(admin|staff))?$/.exec(payload);
  if (!m || Number(m[1]) <= now) return null;
  if (!sameBytes(sig, await hmac(secret, payload))) return null;
  return (m[2] as Role | undefined) ?? "admin";
}
