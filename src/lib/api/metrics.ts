import { requestJson } from "@/lib/api/client";
import { eventStream } from "@/lib/live/event-stream";
import { metricSampleSchema, metricsResponseSchema } from "@/lib/api/schemas";
import type { MetricSample } from "@shared/types";

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
