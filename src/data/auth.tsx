import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ACCESS_DENIED_MESSAGE, decideAccess } from "@/domain/access";
import { getSupabase, supabaseConfigured } from "./client";
import { fetchOwnProfile } from "./queries";

/**
 * Where the current session stands with the Payments-staff gate:
 *  - `none`     — no session.
 *  - `checking` — signed in; the user's own `profiles` row is being read.
 *  - `granted`  — `role = 'admin'`, or the e-mail named in `QUEST_ALLOWED_TEST_EMAIL`.
 *  - `refused`  — anything else; the session is being signed out and `refusal` says why.
 */
export type Access = "none" | "checking" | "granted" | "refused";

interface AuthState {
  session: Session | null;
  /** True until the persisted session has been read once. */
  ready: boolean;
  configured: boolean;
  access: Access;
  /** Why the last sign-in was refused; shown on /login until the next attempt. */
  refusal: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Build-time; only `VITE_` and `QUEST_ALLOWED_` variables reach the bundle (vite.config.ts `envPrefix`). */
const ALLOWED_TEST_EMAIL = import.meta.env.QUEST_ALLOWED_TEST_EMAIL ?? "";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [access, setAccess] = useState<Access>("none");
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    let cancelled = false;
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keyed on the user, not the session object, so hourly token refreshes do not re-read profiles.
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  useEffect(() => {
    if (!userId) {
      setAccess("none");
      return;
    }
    let cancelled = false;
    setAccess("checking");
    (async () => {
      let decision: ReturnType<typeof decideAccess>;
      try {
        const profile = await fetchOwnProfile(getSupabase(), userId);
        decision = decideAccess({ role: profile?.role ?? null, email, allowedTestEmail: ALLOWED_TEST_EMAIL });
      } catch (e) {
        // Fail closed: a profile that cannot be read is not an admin's.
        const detail = e instanceof Error ? e.message : String(e);
        decision = { allowed: false, message: `${ACCESS_DENIED_MESSAGE} Your profile could not be read: ${detail}` };
      }
      if (cancelled) return;
      if (decision.allowed) {
        setRefusal(null);
        setAccess("granted");
        return;
      }
      setRefusal(decision.message);
      setAccess("refused");
      // This browser only: a refused sign-in must not revoke the same account's other sessions.
      await getSupabase().auth.signOut({ scope: "local" });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, email]);

  const signIn = useCallback(async (email: string, password: string) => {
    setRefusal(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, ready, configured: supabaseConfigured, access, refusal, signIn, signOut }),
    [session, ready, access, refusal, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
