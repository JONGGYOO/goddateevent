import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/token";

// /login, /api/login (+ 쿠키만 지우는 /api/logout) 을 뺀 모든 경로는 관리자 세션 쿠키가 있어야 한다.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/logout") return NextResponse.next();

  const ok = await verifyToken(process.env.SESSION_SECRET, request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일·이미지·파비콘은 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)"],
};
