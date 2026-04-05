import { buildApiUrl, requestJsonCached } from "@/lib/api/client";
import { metricSampleSchema, metricsResponseSchema } from "@shared/schemas";
import type { MetricSample, MetricsResponse } from "@shared/types";

/** Fetch recent metric samples */
export async function fetchMetrics(windowSec: number = 30): Promise<MetricSample[]> {
  const data = await requestJsonCached<MetricsResponse>(
    `/api/metrics?window=${windowSec}`,
    {},
    "Failed to fetch metrics",
    metricsResponseSchema
  );
  return data.samples;
}

/** Subscribe to SSE metric stream. Returns a cleanup function. */
export function subscribeMetrics(
  onSample: (sample: MetricSample) => void,
  onError?: (err: Event) => void
): () => void {
  const es = new EventSource(buildApiUrl("/api/metrics/stream"));

  es.addEventListener("sample", (e) => {
    try {
      const parsed = metricSampleSchema.safeParse(JSON.parse(e.data));
      if (parsed.success) {
        onSample(parsed.data);
      }
    } catch {
      // Ignore malformed events.
    }
  });

  es.onerror = (e) => {
    onError?.(e);
  };

  return () => {
    es.close();
  };
}
