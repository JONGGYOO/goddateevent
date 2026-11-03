import { defineApp } from "convex/server";
import { v } from "convex/values";

// SESSION_SECRET: Next(Vercel/.env.local)와 같은 값. 없으면 모든 관리자 함수가 UNAUTHORIZED.
const app = defineApp({
  env: {
    SESSION_SECRET: v.optional(v.string()),
  },
});

export default app;
