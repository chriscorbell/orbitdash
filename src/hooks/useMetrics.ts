import { useSyncExternalStore } from "react";
import { metricsStore, type MetricsState, type MetricsStore } from "@/lib/live/metrics-store";

/** Live metrics; only components that call this re-render when a sample arrives. */
export function useMetrics(store: MetricsStore = metricsStore): MetricsState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
