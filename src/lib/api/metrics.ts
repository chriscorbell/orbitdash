import { requestJson } from "@/lib/api/client";
import { eventStream } from "@/lib/live/event-stream";
import { metricHistorySchema, metricSampleSchema, metricsResponseSchema } from "@/lib/api/schemas";
import type { MetricHistory, MetricHistoryRange, MetricSample } from "@shared/types";

/** Fetch recent metric samples */
export async function fetchMetrics(windowSec: number = 30): Promise<MetricSample[]> {
  const data = await requestJson(
    `/api/metrics?window=${windowSec}`,
    {},
    "Failed to fetch metrics",
    metricsResponseSchema
  );
  return data.samples;
}

/** Fetch rolled-up metric history for a range, as columnar arrays */
export function fetchMetricHistory(range: MetricHistoryRange): Promise<MetricHistory> {
  return requestJson(
    `/api/metrics/history?range=${range}`,
    {},
    "Failed to fetch metric history",
    metricHistorySchema
  );
}

/** Live samples over the shared event stream. Returns a cleanup function. */
export function subscribeMetrics(
  onSample: (sample: MetricSample) => void,
  onError?: (err: Event) => void
): () => void {
  const stopSamples = eventStream.subscribe("metrics", (event) => {
    const parsed = metricSampleSchema.safeParse(event.sample);
    if (parsed.success) {
      onSample(parsed.data);
    }
  });
  const stopConnection = eventStream.onConnection((connection) => {
    if (connection === "error") {
      onError?.(new Event("error"));
    }
  });

  return () => {
    stopSamples();
    stopConnection();
  };
}
