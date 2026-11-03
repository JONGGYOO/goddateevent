"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password) {
      setError("아이디와 비밀번호를 모두 입력하세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      if (res.ok) {
        router.replace("/events");
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const msg =
        body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : "아이디 또는 비밀번호가 맞지 않아요.";
      setError(msg);
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="loginwrap">
      <form className="loginbox" onSubmit={submit} noValidate>
        <div>
          <h1>갓데이트 출석부</h1>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            관리자 계정으로 로그인하세요.
          </p>
        </div>
        <div className="field">
          <label htmlFor="id">아이디</label>
          <input id="id" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호</label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="errmsg" role="alert">
            {error}
          </p>
        )}
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
