import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildRealm, type PaymentsSnapshot, type Realm } from "@/domain";
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

/**
 * One query loads all nine tables (a few hundred rows). The realm is built in a memo keyed on
 * (snapshot, deadline) so a horizon change is instant and hits Supabase zero times. `asOf` stays
 * the fetch-time clock, not "now" on every year click. `REALM_QUERY_KEY` still invalidates the
 * snapshot; do not put the horizon on the query key (that would refetch).
 */
export function useRealm() {
  const { session, access } = useAuth();
  const { deadline } = useHorizon();
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
    () => (query.data ? buildRealm(query.data.snapshot, query.data.fetchedAt, { deadline }) : undefined),
    [query.data, deadline],
  );

  const data = useMemo<RealmData | undefined>(() => {
    if (!query.data || !realm) return undefined;
    return { realm, tableErrors: query.data.tableErrors, fetchedAt: query.data.fetchedAt };
  }, [query.data, realm]);

  return { ...query, data };
}
