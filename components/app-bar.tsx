"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  ["/members", "회원관리"],
  ["/events", "행사관리"],
  ["/stats", "통계"],
] as const;

export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };
  return (
    <header className="appbar">
      <div className="in">
        <Link href="/events" className="logo">
          갓데이트 출석부
        </Link>
        <nav className="mainnav" aria-label="주 메뉴">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="who">
          <span className="label">admin 로그인</span>
          <button className="btn ghost sm" type="button" onClick={logout} disabled={busy}>
            로그아웃
          </button>
        </span>
      </div>
    </header>
  );
}

export function AppBarSkeleton() {
  return (
    <header className="appbar">
      <div className="in">
        <span className="logo">갓데이트 출석부</span>
      </div>
    </header>
  );
}
