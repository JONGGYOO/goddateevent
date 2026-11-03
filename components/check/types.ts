import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type Board = NonNullable<FunctionReturnType<typeof api.checkin.boardBySession>>;
export type Person = Board["people"][number];
