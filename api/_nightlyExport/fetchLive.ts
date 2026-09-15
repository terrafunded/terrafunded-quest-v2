/**
 * Sign in as the Quest viewer and read Payments the same way the SPA does.
 */

import { createClient } from "@supabase/supabase-js";
import { fetchPaymentsSnapshot } from "../../src/data/queries";
import type { PaymentsSnapshot } from "../../src/domain/types";

export async function fetchLivePaymentsSnapshot(
  env: Record<string, string | undefined>,
): Promise<PaymentsSnapshot> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const email = env.QUEST_VIEWER_EMAIL ?? env.QUEST_TEST_EMAIL;
  const password = env.QUEST_VIEWER_PASSWORD ?? env.QUEST_TEST_PASSWORD;
  if (!url || !anon || !email || !password) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / QUEST_VIEWER_EMAIL+PASSWORD (or QUEST_TEST_*)");
  }
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Payments sign-in failed: ${error.message}`);
  const { snapshot } = await fetchPaymentsSnapshot(sb);
  return snapshot;
}
