import { fetchMetrics, subscribeMetrics } from "@/lib/api/metrics";
import type { MetricSample } from "@shared/types";

export type MetricsConnectionStatus = "connecting" | "connected" | "offline";

export interface MetricsState {
  error: string | null;
  latest: MetricSample | null;
  recoveredAt: number | null;
  samples: MetricSample[];
  status: MetricsConnectionStatus;
}

export interface MetricsStoreDependencies {
  document?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  fetchMetrics: (windowSec: number) => Promise<MetricSample[]>;
  now?: () => number;
  subscribeMetrics: (
    onSample: (sample: MetricSample) => void,
    onError?: (error: Event) => void
  ) => () => void;
}

export interface MetricsStore {
  getSnapshot: () => MetricsState;
  subscribe: (listener: () => void) => () => void;
}

export const MAX_POINTS = 31;
export const OFFLINE_TIMEOUT_MS = 15_000;
export const RECOVERY_NOTICE_MS = 5_000;

const INITIAL_STATE: MetricsState = {
  error: null,
  latest: null,
  recoveredAt: null,
  samples: [],
  status: "connecting",
};

function mergeSamples(current: MetricSample[], incoming: MetricSample[]): MetricSample[] {
  const byTimestamp = new Map<number, MetricSample>();
  for (const sample of [...current, ...incoming]) {
    byTimestamp.set(sample.ts, sample);
  }
  return [...byTimestamp.values()].sort((left, right) => left.ts - right.ts).slice(-MAX_POINTS);
}

/**
 * Live metrics shared by every component that shows them. Components subscribe through
 * useSyncExternalStore, so a new sample re-renders only those components instead of the whole app.
 * The connection opens with the first subscriber, closes with the last, and pauses while the tab
 * is hidden.
 */
export function createMetricsStore(deps: MetricsStoreDependencies): MetricsStore {
  const now = deps.now ?? (() => Date.now());
  const doc = deps.document ?? (typeof document === "undefined" ? undefined : document);
  const listeners = new Set<() => void>();

  let state = INITIAL_STATE;
  let closeStream: (() => void) | null = null;
  let offlineTimer: ReturnType<typeof setInterval> | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  // Client-clock time we last heard from the server. Never compare the server-generated sample.ts
  // against the client clock: skew between the two would fake a permanent offline state.
  let lastHeardAt: number | null = null;
  let awaitingRecovery = false;
  let generation = 0;

  const setState = (patch: Partial<MetricsState>) => {
    state = { ...state, ...patch };
    if (patch.samples) {
      state.latest = state.samples.at(-1) ?? null;
    }
    for (const listener of listeners) {
      listener();
    }
  };

  const showRecovered = () => {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    setState({ recoveredAt: now() });
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      setState({ recoveredAt: null });
    }, RECOVERY_NOTICE_MS);
  };

  const handleSample = (sample: MetricSample) => {
    lastHeardAt = now();
    if (awaitingRecovery) {
      awaitingRecovery = false;
      showRecovered();
    }
    setState({
      error: null,
      samples: mergeSamples(state.samples, [sample]),
      status: "connected",
    });
  };

  const handleStreamError = () => {
    awaitingRecovery = true;
    setState({ status: "connecting" });
  };

  const checkOffline = () => {
    if (lastHeardAt !== null && now() - lastHeardAt > OFFLINE_TIMEOUT_MS) {
      awaitingRecovery = true;
      if (state.status !== "offline") {
        setState({ status: "offline" });
      }
    }
  };

  const connect = async () => {
    const connection = ++generation;

    try {
      const initial = await deps.fetchMetrics(MAX_POINTS);
      if (connection !== generation) return;
      if (initial.length > 0) {
        lastHeardAt = now();
      }
      setState({ error: null, samples: mergeSamples(state.samples, initial) });
    } catch (loadError) {
      if (connection !== generation) return;
      setState({
        error: loadError instanceof Error ? loadError.message : "Failed to load metrics",
      });
    }

    if (connection !== generation) return;
    closeStream = deps.subscribeMetrics(handleSample, handleStreamError);
    offlineTimer = setInterval(checkOffline, 1_000);
  };

  const disconnect = () => {
    generation++;
    closeStream?.();
    closeStream = null;
    if (offlineTimer) clearInterval(offlineTimer);
    offlineTimer = null;
  };

  const handleVisibilityChange = () => {
    if (doc?.visibilityState === "hidden") {
      disconnect();
      return;
    }
    // Coming back: the gap is backfilled by the initial fetch, and it isn't an outage.
    awaitingRecovery = false;
    lastHeardAt = null;
    void connect();
  };

  const start = () => {
    doc?.addEventListener("visibilitychange", handleVisibilityChange);
    if (doc?.visibilityState !== "hidden") {
      void connect();
    }
  };

  const stop = () => {
    disconnect();
    doc?.removeEventListener("visibilitychange", handleVisibilityChange);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    lastHeardAt = null;
    awaitingRecovery = false;
    state = INITIAL_STATE;
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        start();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop();
        }
      };
    },
  };
}

export const metricsStore = createMetricsStore({ fetchMetrics, subscribeMetrics });
