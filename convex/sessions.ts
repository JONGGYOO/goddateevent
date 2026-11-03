import { v } from "convex/values";
import { adminMutation, adminQuery } from "./lib/auth";
import { deleteSessionCascade, fieldError, getOrThrow, sessionsOf } from "./lib/data";
import { fmtSession, isYmd } from "../lib/date";

/** 날짜 순 회차 목록 (번호 포함) */
export const listByEvent = adminQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => sessionsOf(ctx, eventId),
});

export const create = adminMutation({
  args: { eventId: v.id("events"), date: v.string() },
  handler: async (ctx, { eventId, date }) => {
    await getOrThrow(ctx, "events", eventId);
    if (!isYmd(date)) fieldError("date", "날짜를 고르세요.");
    const dup = await ctx.db
      .query("sessions")
      .withIndex("by_event_date", (q) => q.eq("eventId", eventId).eq("date", date))
      .first();
    if (dup) fieldError("date", `${fmtSession(date)}에는 이미 회차가 있어요.`);
    const id = await ctx.db.insert("sessions", { eventId, date });
    const no = (await sessionsOf(ctx, eventId)).find((s) => s._id === id)?.no ?? 0;
    return { id, no };
  },
});

export const updateDate = adminMutation({
  args: { id: v.id("sessions"), date: v.string() },
  handler: async (ctx, { id, date }) => {
    const s = await getOrThrow(ctx, "sessions", id);
    if (!isYmd(date)) fieldError("date", "날짜를 고르세요.");
    const dup = await ctx.db
      .query("sessions")
      .withIndex("by_event_date", (q) => q.eq("eventId", s.eventId).eq("date", date))
      .first();
    if (dup && dup._id !== id) fieldError("date", `${fmtSession(date)}에는 이미 회차가 있어요.`);
    await ctx.db.patch("sessions", id, { date });
    return null;
  },
});

export const remove = adminMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, { id }) => {
    await getOrThrow(ctx, "sessions", id);
    await deleteSessionCascade(ctx, id);
    return null;
  },
});
