import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/data/auth";
import type { WeeklyFacts, WeeklyRead } from "@/domain/weeklyCouncil";

/** Mirrors the serverless JSON. Kept here so the client never imports `api/`. */
export type WeeklyCouncilResponse =
  | {
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
  | {
      ok: false;
      unavailable: true;
      reason: "weekly_read_unavailable" | "regenerate_limit" | "unauthorized";
      limit?: number;
      reset?: string;
    };

export const WEEKLY_COUNCIL_QUERY_KEY = ["weekly-council"] as const;

async function postWeekly(facts: WeeklyFacts, token: string, force: boolean): Promise<WeeklyCouncilResponse> {
  try {
    const res = await fetch("/api/weekly-council", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ facts, force }),
    });
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "ok" in body) return body as WeeklyCouncilResponse;
    return { ok: false, unavailable: true, reason: "weekly_read_unavailable" };
  } catch {
    return { ok: false, unavailable: true, reason: "weekly_read_unavailable" };
  }
}

/**
 * Loads the weekly read for the current ISO week + horizon + language.
 * Never calls Anthropic from the browser — only POST /api/weekly-council.
 */
export function useWeeklyCouncil(facts: WeeklyFacts | null) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const queryClient = useQueryClient();
  const key = [...WEEKLY_COUNCIL_QUERY_KEY, facts?.week ?? "", facts?.horizon ?? 0, facts?.lang ?? ""] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!facts && !!token,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () => postWeekly(facts as WeeklyFacts, token as string, false),
  });

  const regen = useMutation({
    mutationFn: () => postWeekly(facts as WeeklyFacts, token as string, true),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
    },
  });

  const last = regen.data ?? query.data;
  const successful = regen.data?.ok ? regen.data : query.data?.ok ? query.data : last;
  const limit =
    last && !last.ok && last.reason === "regenerate_limit" ? last : undefined;

  return {
    response: successful,
    limit,
    isLoading: query.isLoading,
    regenerating: regen.isPending,
    regenerate: () => regen.mutate(),
  };
}
