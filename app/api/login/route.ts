import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, signToken } from "@/lib/token";

const enc = new TextEncoder();

/** 길이 노출 없이 문자열 비교 */
async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function POST(request: Request) {
  const { ADMIN_ID, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
  if (!ADMIN_ID || !ADMIN_PASSWORD || !SESSION_SECRET) {
    return NextResponse.json({ error: "서버 설정(ADMIN_ID, ADMIN_PASSWORD, SESSION_SECRET)이 비어 있어요. 관리자에게 알려 주세요." }, { status: 500 });
  }
  let id = "";
  let password = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      id = typeof b.id === "string" ? b.id.trim() : "";
      password = typeof b.password === "string" ? b.password : "";
    }
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const ok = (await safeEqual(id, ADMIN_ID)) && (await safeEqual(password, ADMIN_PASSWORD));
  if (!ok) return NextResponse.json({ error: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 401 });

  const token = await signToken(SESSION_SECRET);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
