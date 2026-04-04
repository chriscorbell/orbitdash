import { useEffect, useMemo, useRef, useState } from "react";
import type { MetricSample } from "@shared/types";
import { fetchMetrics, subscribeMetrics } from "@/lib/api/metrics";

const MAX_POINTS = 31;
const OFFLINE_TIMEOUT_MS = 15_000;

export function useMetrics() {
    const [samples, setSamples] = useState<MetricSample[]>([]);
    const [status, setStatus] = useState<"connecting" | "connected" | "offline">(
        "connecting"
    );
    const [error, setError] = useState<string | null>(null);
    const lastSampleRef = useRef<number | null>(null);

    useEffect(() => {
        let isActive = true;
        let cleanup = () => {};

        const applyLatestTimestamp = (nextSamples: MetricSample[]) => {
            lastSampleRef.current =
                nextSamples.length > 0 ? nextSamples[nextSamples.length - 1].ts : null;
        };

        const loadAndSubscribe = async () => {
            try {
                const initial = await fetchMetrics(MAX_POINTS);
                if (!isActive) {
                    return;
                }

                const trimmed = initial.slice(-MAX_POINTS);
                setSamples(trimmed);
                applyLatestTimestamp(trimmed);
                setError(null);
            } catch (loadError) {
                if (!isActive) {
                    return;
                }

                setError(loadError instanceof Error ? loadError.message : "Failed to load metrics");
            }

            if (!isActive) {
                return;
            }

            cleanup = subscribeMetrics(
                (sample) => {
                    setStatus("connected");
                    setError(null);
                    setSamples((current) => {
                        const next = [...current, sample].slice(-MAX_POINTS);
                        applyLatestTimestamp(next);
                        return next;
                    });
                },
                () => {
                    if (isActive) {
                        setStatus("connecting");
                    }
                }
            );
        };

        void loadAndSubscribe();

        const checkOffline = setInterval(() => {
            const lastSampleTs = lastSampleRef.current;
            if (lastSampleTs === null) {
                return;
            }
            if (Date.now() - lastSampleTs > OFFLINE_TIMEOUT_MS) {
                setStatus("offline");
            }
        }, 1000);

        return () => {
            isActive = false;
            clearInterval(checkOffline);
            cleanup();
        };
    }, []);

    const latest = useMemo(() => {
        return samples.length > 0 ? samples[samples.length - 1] : null;
    }, [samples]);

    return { samples, latest, status, error };
}
