import { buildApiUrl, requestJson } from "@/lib/api/client";
import type { MetricSample, MetricsResponse } from "@shared/types";

/** Fetch recent metric samples */
export async function fetchMetrics(windowSec: number = 30): Promise<MetricSample[]> {
    const data = await requestJson<MetricsResponse>(
        `/api/metrics?window=${windowSec}`,
        {},
        "Failed to fetch metrics"
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
            const sample: MetricSample = JSON.parse(e.data);
            onSample(sample);
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
