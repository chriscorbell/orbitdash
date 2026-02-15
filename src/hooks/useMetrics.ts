import { useState, useEffect, useRef, useCallback } from "react";
import type { MetricSample } from "@/shared/types";
import { fetchMetrics, subscribeMetrics } from "@/lib/api";

const MAX_POINTS = 31;
const OFFLINE_TIMEOUT_MS = 15_000;

export function useMetrics() {
    const [samples, setSamples] = useState<MetricSample[]>([]);
    const [status, setStatus] = useState<"connecting" | "connected" | "offline">(
        "connecting"
    );
    const samplesRef = useRef<MetricSample[]>([]);
    const lastSampleRef = useRef<number | null>(null);

    const addSample = useCallback((sample: MetricSample) => {
        const next = [...samplesRef.current, sample].slice(-MAX_POINTS);
        samplesRef.current = next;
        setSamples(next);
    }, []);

    const recordSampleTs = useCallback((ts: number) => {
        lastSampleRef.current = ts;
    }, []);

    useEffect(() => {
        let cleanup: (() => void) | undefined;

        // Load initial data
        fetchMetrics(MAX_POINTS)
            .then((initial) => {
                const trimmed = initial.slice(-MAX_POINTS);
                samplesRef.current = trimmed;
                setSamples(trimmed);
            })
            .catch(console.error)
            .finally(() => {
                // Subscribe to SSE
                cleanup = subscribeMetrics(
                    (sample) => {
                        setStatus("connected");
                        recordSampleTs(sample.ts);
                        addSample(sample);
                    },
                    () => {
                        setStatus("connecting");
                    }
                );
            });

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
            clearInterval(checkOffline);
            cleanup?.();
        };
    }, [addSample, recordSampleTs]);

    const latest = samples.length > 0 ? samples[samples.length - 1] : null;

    useEffect(() => {
        if (latest?.ts && lastSampleRef.current !== latest.ts) {
            lastSampleRef.current = latest.ts;
        }
    }, [latest]);

    return { samples, latest, status };
}
