// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMetrics } from "@/hooks/useMetrics";
import * as metricsApi from "@/lib/api/metrics";
import type { MetricSample } from "@shared/types";

vi.mock("@/lib/api/metrics", () => ({
  fetchMetrics: vi.fn(),
  subscribeMetrics: vi.fn(),
}));

const fetchMetricsMock = vi.mocked(metricsApi.fetchMetrics);
const subscribeMetricsMock = vi.mocked(metricsApi.subscribeMetrics);

let cleanupCallCount: number;
let onSample: ((sample: MetricSample) => void) | undefined;
let onError: ((error: Event) => void) | undefined;

beforeEach(() => {
  cleanupCallCount = 0;
  onSample = undefined;
  onError = undefined;

  subscribeMetricsMock.mockImplementation((handleSample, handleError) => {
    onSample = handleSample;
    onError = handleError;
    return () => {
      cleanupCallCount += 1;
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useMetrics", () => {
  it("loads initial samples, subscribes, and updates status on new samples", async () => {
    const initialSample: MetricSample = {
      ts: Date.now(),
      cpu: 10,
      ram: 20,
      disk: 30,
    };
    const nextSample: MetricSample = {
      ts: Date.now() + 1_000,
      cpu: 40,
      ram: 50,
      disk: 60,
    };

    fetchMetricsMock.mockResolvedValue([initialSample]);

    const { result, unmount } = renderHook(() => useMetrics());

    await waitFor(() => {
      expect(result.current.latest).toEqual(initialSample);
    });

    await act(async () => {
      onSample?.(nextSample);
    });

    expect(result.current.latest).toEqual(nextSample);
    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(result.current.recoveredAt).toBeNull();

    await act(async () => {
      onError?.(new Event("error"));
    });

    expect(result.current.status).toBe("connecting");

    await act(async () => {
      onSample?.({ ts: Date.now() + 2_000, cpu: 11, ram: 22, disk: 33 });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.recoveredAt).toBeTruthy();

    unmount();
    expect(cleanupCallCount).toBe(1);
  });

  it("reports load failures", async () => {
    fetchMetricsMock.mockRejectedValue(new Error("metrics failed"));

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => {
      expect(result.current.error).toBe("metrics failed");
    });

    expect(result.current.samples).toEqual([]);
    expect(result.current.status).toBe("connecting");
    expect(result.current.recoveredAt).toBeNull();
  });

  it("marks metrics as offline when samples go stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T00:00:00.000Z"));

    const initialSample: MetricSample = {
      ts: Date.now(),
      cpu: 10,
      ram: 20,
      disk: 30,
    };

    fetchMetricsMock.mockResolvedValue([initialSample]);

    const { result } = renderHook(() => useMetrics());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.latest).toEqual(initialSample);

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(result.current.status).toBe("offline");
    expect(result.current.recoveredAt).toBeNull();
  });

  it("stays connected when server timestamps are skewed from the client clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T00:00:00.000Z"));

    // Server clock is a minute behind the client clock.
    const skewedSample: MetricSample = {
      ts: Date.now() - 60_000,
      cpu: 10,
      ram: 20,
      disk: 30,
    };

    fetchMetricsMock.mockResolvedValue([]);

    const { result } = renderHook(() => useMetrics());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      onSample?.(skewedSample);
    });

    expect(result.current.status).toBe("connected");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.status).toBe("connected");
  });
});
