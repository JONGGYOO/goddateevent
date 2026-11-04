"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

// [주소, 이름, 휴대폰용 짧은 이름]
const NAV = [
  ["/members", "회원관리", "회원"],
  ["/events", "행사관리", "행사"],
  ["/stats", "통계", "통계"],
  ["/codes", "공통코드", "코드"],
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
          {NAV.map(([href, label, short]) => (
            <Link key={href} href={href} aria-label={label} aria-current={pathname.startsWith(href) ? "page" : undefined}>
              <span className="full">{label}</span>
              <span className="short" aria-hidden>
                {short}
              </span>
            </Link>
          ))}
        </nav>
        <span className="who">
          <span className="label">admin 로그인</span>
          <button className="btn ghost sm logout" type="button" onClick={logout} disabled={busy} aria-label="로그아웃">
            <LogOut size={18} aria-hidden />
            <span className="full">로그아웃</span>
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
