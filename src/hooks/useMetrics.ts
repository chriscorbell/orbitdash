import { useEffect, useMemo, useRef, useState } from "react";
import type { MetricSample } from "@shared/types";
import { fetchMetrics, subscribeMetrics } from "@/lib/api/metrics";

const MAX_POINTS = 31;
const OFFLINE_TIMEOUT_MS = 15_000;
const RECOVERY_NOTICE_MS = 5_000;

export function useMetrics() {
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [recoveredAt, setRecoveredAt] = useState<number | null>(null);
  // Client-clock time we last heard from the server. Never compare the
  // server-generated sample.ts against the client clock — skew between the
  // two would fake a permanent offline state.
  const lastHeardAtRef = useRef<number | null>(null);
  const statusRef = useRef<"connecting" | "connected" | "offline">("connecting");
  const awaitingRecoveryRef = useRef(false);

  const setConnectionStatus = (nextStatus: "connecting" | "connected" | "offline") => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  useEffect(() => {
    let isActive = true;
    let cleanup = () => {};

    const loadAndSubscribe = async () => {
      try {
        const initial = await fetchMetrics(MAX_POINTS);
        if (!isActive) {
          return;
        }

        const trimmed = initial.slice(-MAX_POINTS);
        setSamples(trimmed);
        lastHeardAtRef.current = trimmed.length > 0 ? Date.now() : null;
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
          if (awaitingRecoveryRef.current) {
            awaitingRecoveryRef.current = false;
            setRecoveredAt(Date.now());
          }
          setConnectionStatus("connected");
          setError(null);
          lastHeardAtRef.current = Date.now();
          setSamples((current) => [...current, sample].slice(-MAX_POINTS));
        },
        () => {
          if (isActive) {
            awaitingRecoveryRef.current = true;
            setConnectionStatus("connecting");
          }
        }
      );
    };

    void loadAndSubscribe();

    const checkOffline = setInterval(() => {
      const lastHeardAt = lastHeardAtRef.current;
      if (lastHeardAt === null) {
        return;
      }
      if (Date.now() - lastHeardAt > OFFLINE_TIMEOUT_MS) {
        awaitingRecoveryRef.current = true;
        setConnectionStatus("offline");
      }
    }, 1000);

    return () => {
      isActive = false;
      clearInterval(checkOffline);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (recoveredAt === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRecoveredAt(null);
    }, RECOVERY_NOTICE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [recoveredAt]);

  const latest = useMemo(() => {
    return samples.length > 0 ? samples[samples.length - 1] : null;
  }, [samples]);

  return { samples, latest, status, error, recoveredAt };
}
