"use client";

import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { errInfo } from "@/lib/errors";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const TokenCtx = createContext<string | null>(null);

/** 관리자 화면 공통 Provider: Convex 클라이언트 + 세션 토큰 */
export function AdminProviders({ token, children }: { token: string; children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <TokenCtx.Provider value={token}>{children}</TokenCtx.Provider>
    </ConvexProvider>
  );
}

export function useAdminToken(): string {
  const t = useContext(TokenCtx);
  if (t === null) throw new Error("AdminProviders 밖에서 호출했어요.");
  return t;
}

type TokenFn<T extends "query" | "mutation"> = FunctionReference<T, "public", { token: string }>;
type ArgsOf<F extends TokenFn<"query" | "mutation">> = Omit<FunctionArgs<F>, "token">;

/** token을 자동으로 붙이는 useQuery */
export function useAQ<F extends TokenFn<"query">>(fn: F, args: ArgsOf<F> | "skip"): FunctionReturnType<F> | undefined {
  const token = useAdminToken();
  // useQuery의 가변 인자 타입은 제네릭 F를 따라가지 못해 여기서 한 번만 맞춰 준다.
  const q = useQuery as unknown as (f: F, a: FunctionArgs<F> | "skip") => FunctionReturnType<F> | undefined;
  return q(fn, args === "skip" ? "skip" : ({ ...args, token } as unknown as FunctionArgs<F>));
}

/** token을 자동으로 붙이는 useMutation. 세션 만료면 로그인 화면으로 보낸다 */
export function useAM<F extends TokenFn<"mutation">>(fn: F): (args: ArgsOf<F>) => Promise<FunctionReturnType<F>> {
  const token = useAdminToken();
  const router = useRouter();
  const m = useMutation(fn) as unknown as (a: FunctionArgs<F>) => Promise<FunctionReturnType<F>>;
  return useCallback(
    async (args: ArgsOf<F>) => {
      try {
        return await m({ ...args, token } as unknown as FunctionArgs<F>);
      } catch (e) {
        const info = errInfo(e);
        if (info.unauthorized) {
          toast(info.message);
          setTimeout(() => router.replace("/login"), 800);
        }
        throw e;
      }
    },
    [m, token, router],
  );
}

/* 이 기기: 태블릿 A / B (localStorage에 기억) */
const DEVICE_KEY = "gd-device";
const deviceListeners = new Set<() => void>();
let deviceFallback: "A" | "B" = "A"; // 저장소를 못 쓰는 환경용

function subscribeDevice(cb: () => void) {
  deviceListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    deviceListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readDevice(): "A" | "B" {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v === "B" ? "B" : v === "A" ? "A" : deviceFallback;
  } catch {
    return deviceFallback;
  }
}

export function useDevice(): ["A" | "B", (d: "A" | "B") => void] {
  const dev = useSyncExternalStore(subscribeDevice, readDevice, () => "A" as const);
  const set = useCallback((d: "A" | "B") => {
    deviceFallback = d;
    try {
      localStorage.setItem(DEVICE_KEY, d);
    } catch {
      /* 무시: deviceFallback으로 기억 */
    }
    deviceListeners.forEach((l) => l());
  }, []);
  return [dev, set];
}

/** 서울 기준 오늘 (자정이 지나면 갱신) */
export function useToday(): string {
  const calc = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [today, setToday] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setToday(calc()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}
