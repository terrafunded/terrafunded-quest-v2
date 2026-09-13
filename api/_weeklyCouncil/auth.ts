import { createClient } from "@supabase/supabase-js";
import { decideAccess } from "../../src/domain/access";
import type { SessionOk, WeeklyCouncilDeps } from "./types";

/**
 * Verify a Bearer token against Supabase Auth and the Payments-staff gate.
 * Anonymous or refused callers never reach the model — this endpoint costs money.
 */
export async function verifyQuestSession(token: string, env: NonNullable<WeeklyCouncilDeps["env"]>): Promise<SessionOk | { ok: false }> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return { ok: false };
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const readUser = () => sb.auth.getUser(token);
  let { data, error } = await readUser();
  if (error || !data.user) {
    ({ data, error } = await readUser());
  }
  if (error || !data.user) return { ok: false };
  const { data: profile } = await sb.from("profiles").select("id, role").eq("id", data.user.id).maybeSingle();
  const decision = decideAccess({
    role: profile?.role ?? null,
    email: data.user.email,
    allowedTestEmail: env.QUEST_ALLOWED_TEST_EMAIL,
  });
  if (!decision.allowed) return { ok: false };
  return { ok: true, userId: data.user.id, email: data.user.email ?? null };
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)/i.exec(header.trim());
  return m?.[1] ?? null;
}
