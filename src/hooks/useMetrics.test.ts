// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMetrics } from "@/hooks/useMetrics";
import {
  createMetricsStore,
  MAX_POINTS,
  OFFLINE_TIMEOUT_MS,
  RECOVERY_NOTICE_MS,
  type MetricsStoreDependencies,
} from "@/lib/live/metrics-store";
import type { MetricSample } from "@shared/types";

vi.mock("@/lib/api/metrics", () => ({
  fetchMetrics: vi.fn(),
  subscribeMetrics: vi.fn(),
}));

function sample(ts: number, cpu = 10): MetricSample {
  return { ts, cpu, ram: 20, disk: 30 };
}

class FakeDocument {
  visibilityState: DocumentVisibilityState = "visible";
  private listeners = new Set<() => void>();

  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }

  setVisibility(next: DocumentVisibilityState) {
    this.visibilityState = next;
    for (const listener of this.listeners) listener();
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

let fakeDocument: FakeDocument;
let onSample: ((value: MetricSample) => void) | undefined;
let onError: ((error: Event) => void) | undefined;
let closeCount: number;
let deps: MetricsStoreDependencies & {
  fetchMetrics: ReturnType<typeof vi.fn>;
  subscribeMetrics: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.useFakeTimers();
  fakeDocument = new FakeDocument();
  onSample = undefined;
  onError = undefined;
  closeCount = 0;
  deps = {
    document: fakeDocument as unknown as Document,
    fetchMetrics: vi.fn().mockResolvedValue([]),
    subscribeMetrics: vi.fn((handleSample, handleError) => {
      onSample = handleSample;
      onError = handleError;
      return () => {
        closeCount += 1;
      };
    }),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("metrics store", () => {
  it("loads the initial window, subscribes, and follows the stream", async () => {
    deps.fetchMetrics.mockResolvedValue([sample(1)]);
    const store = createMetricsStore(deps);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    await flush();

    expect(deps.fetchMetrics).toHaveBeenCalledWith(MAX_POINTS);
    expect(store.getSnapshot().latest).toEqual(sample(1));
    expect(store.getSnapshot().status).toBe("connecting");

    onSample?.(sample(2, 55));
    expect(store.getSnapshot()).toMatchObject({
      latest: sample(2, 55),
      status: "connected",
      error: null,
      recoveredAt: null,
    });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    expect(closeCount).toBe(1);
  });

  it("returns the same snapshot object until something changes", async () => {
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    onSample?.(sample(1));
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("keeps the newest samples and ignores duplicates", async () => {
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    for (let ts = 1; ts <= MAX_POINTS + 5; ts++) {
      onSample?.(sample(ts));
    }
    onSample?.(sample(MAX_POINTS + 5, 99));

    const { samples, latest } = store.getSnapshot();
    expect(samples).toHaveLength(MAX_POINTS);
    expect(samples[0].ts).toBe(6);
    expect(latest).toEqual(sample(MAX_POINTS + 5, 99));
  });

  it("shows a recovery notice after a stream error, then clears it", async () => {
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    onSample?.(sample(1));
    onError?.(new Event("error"));
    expect(store.getSnapshot().status).toBe("connecting");

    onSample?.(sample(2));
    expect(store.getSnapshot().status).toBe("connected");
    expect(store.getSnapshot().recoveredAt).not.toBeNull();

    vi.advanceTimersByTime(RECOVERY_NOTICE_MS);
    expect(store.getSnapshot().recoveredAt).toBeNull();
  });

  it("goes offline after a silent period and recovers on the next sample", async () => {
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    onSample?.(sample(1));
    vi.advanceTimersByTime(OFFLINE_TIMEOUT_MS + 1_000);
    expect(store.getSnapshot().status).toBe("offline");

    onSample?.(sample(2));
    expect(store.getSnapshot().status).toBe("connected");
    expect(store.getSnapshot().recoveredAt).not.toBeNull();
  });

  it("reports a failed initial load but still subscribes", async () => {
    deps.fetchMetrics.mockRejectedValue(new Error("nope"));
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    expect(store.getSnapshot().error).toBe("nope");
    expect(deps.subscribeMetrics).toHaveBeenCalledTimes(1);

    onSample?.(sample(1));
    expect(store.getSnapshot().error).toBeNull();
  });

  it("uses a generic message for non-Error load failures", async () => {
    deps.fetchMetrics.mockRejectedValue("boom");
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    expect(store.getSnapshot().error).toBe("Failed to load metrics");
  });

  it("closes the stream and resets when the last subscriber leaves", async () => {
    const store = createMetricsStore(deps);
    const first = store.subscribe(() => {});
    const second = store.subscribe(() => {});
    await flush();
    onSample?.(sample(1));

    first();
    expect(closeCount).toBe(0);
    second();
    expect(closeCount).toBe(1);
    expect(fakeDocument.listenerCount).toBe(0);
    expect(store.getSnapshot().samples).toEqual([]);
  });

  it("ignores a slow initial load that finishes after unsubscribing", async () => {
    let resolveLoad: (value: MetricSample[]) => void = () => {};
    deps.fetchMetrics.mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)));
    const store = createMetricsStore(deps);

    const unsubscribe = store.subscribe(() => {});
    unsubscribe();
    resolveLoad([sample(1)]);
    await flush();

    expect(deps.subscribeMetrics).not.toHaveBeenCalled();
    expect(store.getSnapshot().samples).toEqual([]);
  });

  it("pauses while the tab is hidden and backfills when it returns", async () => {
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();
    onSample?.(sample(1));

    fakeDocument.setVisibility("hidden");
    expect(closeCount).toBe(1);

    // No offline flag while hidden, even after a long pause.
    vi.advanceTimersByTime(OFFLINE_TIMEOUT_MS * 3);
    expect(store.getSnapshot().status).toBe("connected");

    deps.fetchMetrics.mockResolvedValue([sample(5), sample(6)]);
    fakeDocument.setVisibility("visible");
    await flush();

    expect(deps.subscribeMetrics).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().samples.map((entry) => entry.ts)).toEqual([1, 5, 6]);

    onSample?.(sample(7));
    expect(store.getSnapshot().recoveredAt).toBeNull();
  });

  it("waits to connect when the page starts hidden", async () => {
    fakeDocument.visibilityState = "hidden";
    const store = createMetricsStore(deps);
    store.subscribe(() => {});
    await flush();

    expect(deps.fetchMetrics).not.toHaveBeenCalled();
    fakeDocument.setVisibility("visible");
    await flush();
    expect(deps.subscribeMetrics).toHaveBeenCalledTimes(1);
  });
});

describe("useMetrics", () => {
  it("re-renders with store updates", async () => {
    const store = createMetricsStore(deps);
    const { result, unmount } = renderHook(() => useMetrics(store));
    await flush();

    act(() => {
      onSample?.(sample(1, 42));
    });
    expect(result.current.latest?.cpu).toBe(42);

    unmount();
    expect(closeCount).toBe(1);
  });
});
