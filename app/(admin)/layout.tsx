import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminProviders } from "@/components/admin";
import { AppBar, AppBarSkeleton } from "@/components/app-bar";
import { SESSION_COOKIE, verifyToken } from "@/lib/token";

// 쿠키(요청 시점 데이터)는 Cache Components 규칙상 <Suspense> 안에서 읽는다.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <>
          <AppBarSkeleton />
          <main className="app">
            <p className="hint">불러오는 중…</p>
          </main>
        </>
      }
    >
      <TokenGate>{children}</TokenGate>
    </Suspense>
  );
}

async function TokenGate({ children }: { children: ReactNode }) {
  // 토큰 만료 확인에 현재 시각이 필요하므로 요청 시점 렌더링으로 둔다.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!(await verifyToken(process.env.SESSION_SECRET, token))) redirect("/login");
  return (
    <AdminProviders token={token}>
      <AppBar />
      <main className="app">{children}</main>
    </AdminProviders>
  );
}
