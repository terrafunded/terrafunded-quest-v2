/**
 * Who may enter Quest.
 *
 * Quest is for Payments staff. After sign-in the app reads the user's own `profiles` row
 * (`id, role`) and lets them in only when `role = 'admin'`. Every other role — `investor`,
 * `viewer`, `note_buyer`, a missing row — is signed out at once with {@link ACCESS_DENIED_MESSAGE}.
 *
 * One exception, by e-mail: the questbot `viewer` account that `npm run e2e` and
 * `npm run verify:live` sign in with is named explicitly in the build-time env var
 * `QUEST_ALLOWED_TEST_EMAIL`. Nothing else bypasses the role check.
 */

export const ADMIN_ROLE = "admin";

export const ACCESS_DENIED_MESSAGE = "Quest is for the TerraFunded team only.";

export interface AccessInput {
  /** `profiles.role` of the signed-in user; `null` when the row is missing. */
  role: string | null | undefined;
  /** The session's e-mail, as Supabase reports it. */
  email: string | null | undefined;
  /** `QUEST_ALLOWED_TEST_EMAIL` at build time; empty or undefined means no exception. */
  allowedTestEmail: string | null | undefined;
}

export type AccessDecision = { allowed: true; via: "admin" | "test-account" } | { allowed: false; message: string };

/** E-mail comparison is case-insensitive and ignores surrounding whitespace; nothing else is normalised. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function decideAccess({ role, email, allowedTestEmail }: AccessInput): AccessDecision {
  if (role === ADMIN_ROLE) return { allowed: true, via: "admin" };
  const allowed = normalizeEmail(allowedTestEmail);
  if (allowed !== "" && normalizeEmail(email) === allowed) return { allowed: true, via: "test-account" };
  return { allowed: false, message: ACCESS_DENIED_MESSAGE };
}
