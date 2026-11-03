"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { errInfo } from "@/lib/errors";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const info = errInfo(error);
  const router = useRouter();
  useEffect(() => {
    if (info.unauthorized) {
      const t = setTimeout(() => router.replace("/login"), 1200);
      return () => clearTimeout(t);
    }
  }, [info.unauthorized, router]);
  return (
    <div className="empty">
      <strong>{info.unauthorized ? info.message : "화면을 불러오지 못했어요."}</strong>
      {!info.unauthorized && <span className="hint">인터넷 연결을 확인한 뒤 다시 시도해 주세요.</span>}
      <div className="actions">
        {info.unauthorized ? (
          <a className="btn" href="/login">
            로그인하러 가기
          </a>
        ) : (
          <button className="btn" type="button" onClick={reset}>
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
