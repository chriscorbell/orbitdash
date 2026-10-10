// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAlertEvent, useAlerts } from "@/hooks/useAlerts";
import * as api from "@/lib/api/alerts";
import { createQueryWrapper } from "@/test/query";
import type { MetricAlert } from "@shared/types";

const harness = vi.hoisted(() => ({
  onAlert: undefined as ((alert: MetricAlert) => void) | undefined,
}));

vi.mock("@/lib/api/alerts", () => ({
  fetchAlerts: vi.fn(),
  updateAlertRules: vi.fn(),
  subscribeAlerts: vi.fn((listener: (alert: MetricAlert) => void) => {
    harness.onAlert = listener;
    return () => {
      harness.onAlert = undefined;
    };
  }),
}));

const alert: MetricAlert = {
  id: "a",
  metric: "cpu",
  subject: null,
  threshold: 90,
  durationSec: 60,
  value: 95,
  peak: 95,
  startedAt: 0,
  firedAt: 60_000,
  resolvedAt: null,
};

afterEach(() => vi.clearAllMocks());

describe("applyAlertEvent", () => {
  it("adds firing alerts, moves resolved ones to recent, and caps recent", () => {
    const empty = { active: [], recent: [], rules: [] };
    const firing = applyAlertEvent(empty, alert);
    expect(firing.active).toEqual([alert]);

    const resolved = applyAlertEvent(firing, { ...alert, resolvedAt: 70_000 });
    expect(resolved.active).toEqual([]);
    expect(resolved.recent[0].resolvedAt).toBe(70_000);

    const many = {
      ...empty,
      recent: Array.from({ length: 20 }, (_, i) => ({ ...alert, id: `r${i}`, resolvedAt: i })),
    };
    expect(applyAlertEvent(many, { ...alert, resolvedAt: 99 }).recent).toHaveLength(20);
  });
});

describe("useAlerts", () => {
  it("loads alerts, follows live events and saves rule changes", async () => {
    vi.mocked(api.fetchAlerts).mockResolvedValue({ active: [], recent: [], rules: [] });
    vi.mocked(api.updateAlertRules).mockResolvedValue([
      { metric: "cpu", enabled: false, threshold: 90, durationSec: 60 },
    ]);
    const { result } = renderHook(() => useAlerts(), { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(api.fetchAlerts).toHaveBeenCalled());

    act(() => harness.onAlert?.(alert));
    await waitFor(() => expect(result.current.active).toEqual([alert]));

    await act(() =>
      result.current.updateRules([
        { metric: "cpu", enabled: false, threshold: 90, durationSec: 60 },
      ])
    );
    expect(api.updateAlertRules).toHaveBeenCalled();
    await waitFor(() => expect(api.fetchAlerts).toHaveBeenCalledTimes(2));
  });

  it("reports load failures", async () => {
    vi.mocked(api.fetchAlerts).mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useAlerts(), { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.error).toBe("down"));
  });
});
