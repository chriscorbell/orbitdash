import { requestJson } from "@/lib/api/client";
import { metricHistorySchema } from "@/lib/api/metric-schemas";
import type { MetricHistory, MetricHistoryRange } from "@shared/types";

/** Rolled-up metric history for a range, as columnar arrays ready for a chart. */
export function fetchMetricHistory(range: MetricHistoryRange): Promise<MetricHistory> {
  return requestJson(
    `/api/metrics/history?range=${range}`,
    {},
    "Failed to fetch metric history",
    metricHistorySchema
  );
}
