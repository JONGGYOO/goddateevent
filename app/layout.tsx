import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// next.config의 Turbopack CSS 규칙(@tailwindcss/turbopack)이 next/font의 내부 CSS와 충돌해서
// 프로토타입과 같은 방식(Google Fonts 링크)으로 폰트를 불러온다.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap";

export const metadata: Metadata = {
  title: "갓데이트 출석부",
  description: "갓데이트 회원·행사·조 편성·출석 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        {children}
        <Toaster position="bottom-center" theme="system" />
      </body>
    </html>
  );
}
