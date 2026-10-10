import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAlerts, subscribeAlerts, updateAlertRules } from "@/lib/api/alerts";
import type { AlertRule, AlertsResponse, MetricAlert } from "@shared/types";

export const ALERTS_QUERY_KEY = ["alerts"] as const;
const RECENT_LIMIT = 20;

/** The alerts list after one alert fired or resolved. */
export function applyAlertEvent(current: AlertsResponse, alert: MetricAlert): AlertsResponse {
  const active = current.active.filter((entry) => entry.id !== alert.id);
  if (alert.resolvedAt === null) {
    return { ...current, active: [...active, alert] };
  }
  const recent = [alert, ...current.recent.filter((entry) => entry.id !== alert.id)].slice(
    0,
    RECENT_LIMIT
  );
  return { ...current, active, recent };
}

const EMPTY: AlertsResponse = { active: [], recent: [], rules: [] };

/** Firing and recent alerts, kept current from the event stream, and the rules. */
export function useAlerts() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ALERTS_QUERY_KEY, queryFn: fetchAlerts, staleTime: 60_000 });

  useEffect(
    () =>
      subscribeAlerts((alert) => {
        queryClient.setQueryData<AlertsResponse>(ALERTS_QUERY_KEY, (current) =>
          applyAlertEvent(current ?? EMPTY, alert)
        );
      }),
    [queryClient]
  );

  const mutation = useMutation({
    mutationFn: updateAlertRules,
    onSuccess: (rules) => {
      queryClient.setQueryData<AlertsResponse>(ALERTS_QUERY_KEY, (current) => ({
        ...(current ?? EMPTY),
        rules,
      }));
      // Changing a rule restarts its alerts on the server.
      void queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
    },
  });
  const { mutateAsync } = mutation;

  return {
    active: query.data?.active ?? EMPTY.active,
    recent: query.data?.recent ?? EMPTY.recent,
    rules: query.data?.rules ?? EMPTY.rules,
    error: query.error ? query.error.message || "Failed to load alerts" : null,
    updateRules: useCallback((rules: AlertRule[]) => mutateAsync(rules), [mutateAsync]),
  };
}
