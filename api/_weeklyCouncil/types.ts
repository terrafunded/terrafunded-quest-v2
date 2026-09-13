import type { WeeklyFacts, WeeklyRead } from "../../src/domain/weeklyCouncil";

export const WEEKLY_COUNCIL_MODEL = "claude-sonnet-4-6";
export const WEEKLY_COUNCIL_MAX_TOKENS = 1000;
/** Forced regenerations per authenticated user per UTC day. Enforced on the server. */
export const WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT = 10;

export type UnavailableReason = "weekly_read_unavailable" | "regenerate_limit" | "unauthorized";

export interface WeeklyCouncilOk {
  ok: true;
  cached: boolean;
  generatedAt: string;
  week: string;
  weekOf: string;
  horizon: number;
  lang: string;
  tokenCount: number;
  read: WeeklyRead;
}

export interface WeeklyCouncilErr {
  ok: false;
  unavailable: true;
  reason: UnavailableReason;
  limit?: number;
  reset?: string;
}

export type WeeklyCouncilResponse = WeeklyCouncilOk | WeeklyCouncilErr;

export interface CacheRecord {
  week: string;
  horizon: number;
  lang: string;
  payloadHash: string;
  read: WeeklyRead;
  generatedAt: string;
  tokenCount: number;
}

export interface WeeklyCouncilStore {
  get(week: string, horizon: number, lang: string): Promise<CacheRecord | null>;
  set(record: CacheRecord): Promise<void>;
  getForceCount(userId: string, day: string): Promise<number>;
  incrementForceCount(userId: string, day: string): Promise<number>;
}

export interface SessionOk {
  ok: true;
  userId: string;
  email: string | null;
}

export interface WeeklyCouncilDeps {
  now?: Date;
  store?: WeeklyCouncilStore;
  fetchImpl?: typeof fetch;
  verifySession?: (token: string) => Promise<SessionOk | { ok: false }>;
  env?: {
    ANTHROPIC_API_KEY?: string;
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    QUEST_ALLOWED_TEST_EMAIL?: string;
  };
}

export interface WeeklyCouncilInput {
  facts: WeeklyFacts;
  force?: boolean;
}
