import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/data/auth";
import type { FrozenWeeklyWeek, WeeklyActionStatus } from "@/domain/weeklyActions";

export type WeeklyActionsResponse =
  | {
      ok: true;
      week: FrozenWeeklyWeek | null;
      previous: FrozenWeeklyWeek | null;
      history: FrozenWeeklyWeek[];
    }
  | {
      ok: false;
      unavailable: true;
      reason: "unauthorized" | "weekly_actions_unavailable";
    };

export const WEEKLY_ACTIONS_QUERY_KEY = ["weekly-actions"] as const;

async function parse(res: Response): Promise<WeeklyActionsResponse> {
  const body: unknown = await res.json();
  if (body && typeof body === "object" && "ok" in body) return body as WeeklyActionsResponse;
  return { ok: false, unavailable: true, reason: "weekly_actions_unavailable" };
}

async function getWeek(token: string): Promise<WeeklyActionsResponse> {
  try {
    const res = await fetch("/api/weekly-actions", {
      headers: { authorization: `Bearer ${token}` },
    });
    return parse(res);
  } catch {
    return { ok: false, unavailable: true, reason: "weekly_actions_unavailable" };
  }
}

async function postWeek(token: string, week: FrozenWeeklyWeek): Promise<WeeklyActionsResponse> {
  try {
    const res = await fetch("/api/weekly-actions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ week }),
    });
    return parse(res);
  } catch {
    return { ok: false, unavailable: true, reason: "weekly_actions_unavailable" };
  }
}

async function patchStatus(
  token: string,
  week: string,
  actionId: string,
  status: WeeklyActionStatus,
  reason?: string,
): Promise<WeeklyActionsResponse> {
  try {
    const res = await fetch("/api/weekly-actions", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ week, actionId, status, reason }),
    });
    return parse(res);
  } catch {
    return { ok: false, unavailable: true, reason: "weekly_actions_unavailable" };
  }
}

export function useWeeklyActions(generated: FrozenWeeklyWeek | null) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const queryClient = useQueryClient();
  const key = [...WEEKLY_ACTIONS_QUERY_KEY, generated?.week ?? ""] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!token,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const current = await getWeek(token as string);
      if (current.ok && current.week) return current;
      if (generated && token) return postWeek(token, generated);
      return current;
    },
  });

  const patch = useMutation({
    mutationFn: (input: { actionId: string; status: WeeklyActionStatus; reason?: string }) =>
      patchStatus(token as string, generated?.week ?? "", input.actionId, input.status, input.reason),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
    },
  });

  const response = query.data;
  const week = response?.ok ? response.week : null;
  const previous = response?.ok ? response.previous : null;
  const history = response?.ok ? response.history : [];

  return {
    week,
    previous,
    history,
    isLoading: query.isLoading,
    unavailable: response && !response.ok,
    setStatus: patch.mutate,
    setting: patch.isPending,
  };
}
