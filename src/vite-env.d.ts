/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** The one non-admin login the Payments-staff gate admits (the e2e / verify:live questbot). Build-time. */
  readonly QUEST_ALLOWED_TEST_EMAIL?: string;
}
