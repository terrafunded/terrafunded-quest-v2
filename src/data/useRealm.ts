import { useQuery } from "@tanstack/react-query";
import { buildRealm, type Realm } from "@/domain";
import { fetchPaymentsSnapshot, type PaymentsQueryError } from "./queries";
import { getSupabase } from "./client";
import { useAuth } from "./auth";

export interface RealmData {
  realm: Realm;
  /** Tables that could not be read (permissions etc.). Shown as a banner, never swallowed. */
  tableErrors: PaymentsQueryError[];
  fetchedAt: Date;
}

export const REALM_QUERY_KEY = ["payments", "realm"] as const;

/**
 * One query loads all nine tables (a few hundred rows) and builds the realm once.
 * Every page reads from this; nothing else touches Supabase.
 */
export function useRealm() {
  const { session } = useAuth();
  return useQuery<RealmData, Error>({
    queryKey: [...REALM_QUERY_KEY, session?.user.id ?? "anon"],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const { snapshot, errors } = await fetchPaymentsSnapshot(getSupabase());
      return { realm: buildRealm(snapshot, new Date()), tableErrors: errors, fetchedAt: new Date() };
    },
  });
}
