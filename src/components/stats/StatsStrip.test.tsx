// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sparkline } from "@/components/stats/Sparkline";
import { StatsStrip } from "@/components/stats/StatsStrip";
import { sparklineCeiling } from "@/lib/sparkline";
import type { MetricsState } from "@/lib/live/metrics-store";
import type { MetricAlert } from "@shared/types";

const metrics = vi.hoisted(() => ({
  state: null as unknown as MetricsState,
  alerts: [] as MetricAlert[],
}));
vi.mock("@/hooks/useMetrics", () => ({ useMetrics: () => metrics.state }));
vi.mock("@/hooks/useAlerts", () => ({ useAlerts: () => ({ active: metrics.alerts }) }));

function setMetrics(patch: Partial<MetricsState>) {
  metrics.state = {
    error: null,
    latest: null,
    recoveredAt: null,
    samples: [],
    status: "connected",
    ...patch,
  };
}

afterEach(() => cleanup());

describe("StatsStrip", () => {
  it("shows each metric with a tone that reflects how busy it is", () => {
    const samples = [
      { ts: 1, cpu: 5, ram: 72.4, disk: 91 },
      { ts: 2, cpu: 4.2, ram: 73, disk: 95.5 },
    ];
    setMetrics({ samples, latest: samples[1] });
    render(<StatsStrip />);

    expect(screen.getByLabelText("CPU 4.2 percent").className).toContain("text-brand");
    expect(screen.getByLabelText("Memory 73.0 percent").className).toContain("text-warning");
    expect(screen.getByLabelText("Disk 95.5 percent").className).toContain("text-destructive");
    expect(screen.getByText("96")).toBeTruthy();
  });

  it("shows placeholders while waiting for the first sample", () => {
    setMetrics({ status: "connecting" });
    render(<StatsStrip />);

    expect(screen.getByLabelText("CPU unavailable")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains reconnecting, offline and failed states", () => {
    const sample = { ts: 1, cpu: 1, ram: 1, disk: 1 };
    setMetrics({ status: "connecting", samples: [sample], latest: sample });
    const { rerender } = render(<StatsStrip />);
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");

    setMetrics({ status: "offline", samples: [sample], latest: sample });
    rerender(<StatsStrip />);
    expect(screen.getByRole("status").textContent).toContain("paused");

    setMetrics({ status: "connecting", error: "boom" });
    rerender(<StatsStrip />);
    expect(screen.getByRole("status").textContent).toContain("unavailable: boom");
  });
});

describe("sparklineCeiling", () => {
  it("picks the smallest comfortable scale above the peak", () => {
    expect(sparklineCeiling([])).toBe(10);
    expect(sparklineCeiling([0.4, 2.1])).toBe(10);
    expect(sparklineCeiling([9.5])).toBe(25);
    expect(sparklineCeiling([34])).toBe(50);
    expect(sparklineCeiling([47])).toBe(100);
    expect(sparklineCeiling([99])).toBe(100);
  });
});

describe("Sparkline", () => {
  it("draws nothing for fewer than two points and a line otherwise", () => {
    const { container, rerender } = render(<Sparkline values={[10]} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);

    rerender(<Sparkline values={[10, 150, -5]} capacity={3} />);
    const [area, line] = container.querySelectorAll("path");
    expect(line.getAttribute("d")).toBe("M0.00,27.20 L50.00,2.00 L100.00,30.00");
    expect(area.getAttribute("d")).toContain("Z");
  });

  it("shows firing alerts above the tiles, red once well past the threshold", () => {
    setMetrics({ status: "connected" });
    const alert: MetricAlert = {
      id: "a",
      metric: "cpu",
      subject: null,
      threshold: 90,
      durationSec: 300,
      value: 97,
      peak: 99,
      startedAt: 0,
      firedAt: 300_000,
      resolvedAt: null,
    };
    metrics.alerts = [
      alert,
      { ...alert, id: "b", metric: "disk", subject: "/srv", threshold: 85, value: 86 },
    ];
    render(<StatsStrip />);

    const items = screen.getByRole("list", { name: "Active alerts" }).querySelectorAll("li");
    expect(items[0].textContent).toContain("CPU above 90% for 5 min");
    expect(items[0].textContent).toContain("now 97%");
    expect(items[0].className).toContain("destructive");
    expect(items[1].textContent).toContain("Disk (/srv) above 85% for 5 min");
    expect(items[1].className).toContain("warning");
    metrics.alerts = [];
  });
});
