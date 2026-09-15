import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { buildRealm, type PaymentsSnapshot, type Realm } from "@/domain";
import { useLang } from "@/i18n/lang";
import { fetchPaymentsSnapshot, type PaymentsQueryError } from "./queries";
import { getSupabase } from "./client";
import { useAuth } from "./auth";
import { useHorizon } from "@/horizon/HorizonProvider";

export interface RealmData {
  realm: Realm;
  /** Tables that could not be read (permissions etc.). Shown as a banner, never swallowed. */
  tableErrors: PaymentsQueryError[];
  fetchedAt: Date;
}

/** Snapshot cache only — horizon is applied in a memo so switching years never refetches Payments. */
export const REALM_QUERY_KEY = ["payments", "realm"] as const;

interface SnapshotCache {
  snapshot: PaymentsSnapshot;
  tableErrors: PaymentsQueryError[];
  fetchedAt: Date;
}

export type RealmQueryResult = Omit<UseQueryResult<SnapshotCache, Error>, "data"> & {
  data: RealmData | undefined;
};

const RealmContext = createContext<RealmQueryResult | null>(null);

/**
 * One snapshot fetch and one `buildRealm` for the whole authenticated tree. `useRealm()` used
 * to memoize inside every caller, so AppShell + ThroneRoom + SinceLastVisit each rebuilt the
 * realm (~70ms × 3) on every render. The query options are unchanged: the cache was never the lag.
 */
export function RealmProvider({ children }: { children: ReactNode }) {
  const value = useSharedRealm();
  return <RealmContext.Provider value={value}>{children}</RealmContext.Provider>;
}

function useSharedRealm(): RealmQueryResult {
  const { session, access } = useAuth();
  const { deadline } = useHorizon();
  const [lang] = useLang();
  const query = useQuery<SnapshotCache, Error>({
    queryKey: [...REALM_QUERY_KEY, session?.user.id ?? "anon"],
    // Never before the Payments-staff check has passed (RequireAuth already guarantees this).
    enabled: !!session && access === "granted",
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const { snapshot, errors } = await fetchPaymentsSnapshot(getSupabase());
      return { snapshot, tableErrors: errors, fetchedAt: new Date() };
    },
  });

  const realm = useMemo(
    () => (query.data ? buildRealm(query.data.snapshot, query.data.fetchedAt, { deadline, lang }) : undefined),
    [query.data, deadline, lang],
  );

  const data = useMemo<RealmData | undefined>(() => {
    if (!query.data || !realm) return undefined;
    return { realm, tableErrors: query.data.tableErrors, fetchedAt: query.data.fetchedAt };
  }, [query.data, realm]);

  return useMemo<RealmQueryResult>(
    () => ({ ...query, data }),
    // `query` is a new object every render; depend on the cache identity and status so a parent
    // re-render (token refresh, hover elsewhere) does not notify every consumer.
    [data, query.dataUpdatedAt, query.status, query.fetchStatus, query.error, query.refetch],
  );
}

/**
 * Same shape as before the hoist: the react-query result plus `{ realm, tableErrors, fetchedAt }`.
 * Must sit under `RealmProvider` (mounted inside the auth gate, above the router).
 */
export function useRealm(): RealmQueryResult {
  const ctx = useContext(RealmContext);
  if (!ctx) throw new Error("useRealm must be used inside <RealmProvider>");
  return ctx;
}
