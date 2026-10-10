// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSnapshot, MetricHistory } from "@shared/types";

const harness = vi.hoisted(() => ({
  onSnapshot: undefined as ((snapshot: HostSnapshot) => void) | undefined,
  charts: [] as Array<{ ariaLabel: string; timeRange: [number, number]; data: unknown[] }>,
}));

vi.mock("@/components/stats-page/TimeChart", () => ({
  TimeChart: (props: {
    ariaLabel: string;
    timeRange: [number, number];
    data: unknown[];
    formatTime: (ms: number) => string;
    formatValue: (value: number) => string;
    onHover?: (index: number | null) => void;
  }) => {
    harness.charts.push(props);
    return (
      <button type="button" aria-label={props.ariaLabel} onClick={() => props.onHover?.(0)}>
        {props.formatValue(50)} {props.formatTime(0)}
      </button>
    );
  },
}));

vi.mock("@/lib/api/host", () => ({
  fetchHostSnapshot: vi.fn(),
  subscribeHostSnapshots: vi.fn((listener: (snapshot: HostSnapshot) => void) => {
    harness.onSnapshot = listener;
    return () => {
      harness.onSnapshot = undefined;
    };
  }),
}));

vi.mock("@/lib/api/history", () => ({ fetchMetricHistory: vi.fn() }));
// No Docker here; the containers card has its own tests.
vi.mock("@/lib/api/docker", () => ({
  fetchDocker: async () => ({
    configured: false,
    available: false,
    error: "Docker isn't set up",
    containers: [],
    updatedAt: null,
  }),
  subscribeContainers: () => () => {},
}));
vi.mock("@/lib/api/alerts", () => ({
  fetchAlerts: vi.fn().mockResolvedValue({
    active: [
      {
        id: "a",
        metric: "disk",
        subject: "/srv",
        threshold: 85,
        durationSec: 60,
        value: 88,
        peak: 89,
        startedAt: 0,
        firedAt: 60_000,
        resolvedAt: null,
      },
    ],
    recent: [
      {
        id: "b",
        metric: "cpu",
        subject: null,
        threshold: 90,
        durationSec: 300,
        value: 50,
        peak: 98,
        startedAt: 0,
        firedAt: 300_000,
        resolvedAt: 5_400_000,
      },
    ],
    rules: [],
  }),
  subscribeAlerts: vi.fn(() => () => {}),
  updateAlertRules: vi.fn(),
}));
vi.mock("@/lib/api/system", () => ({
  fetchSystemInfo: vi.fn().mockResolvedValue({
    cpuCount: 8,
    cpuModel: "Test CPU",
    hostname: "nas",
    kernel: "6.1",
    osName: "Debian",
    platform: "linux",
    uptimeSeconds: 3600,
  }),
}));

import { StatsPage } from "@/components/stats-page/StatsPage";
import * as hostApi from "@/lib/api/host";
import * as metricsApi from "@/lib/api/history";
import { createQueryWrapper } from "@/test/query";

function snapshot(ts: number, usage = 42): HostSnapshot {
  return {
    version: 1,
    ts,
    intervalMs: 1000,
    cpu: {
      usage,
      cores: [
        { id: 0, usage: 80, frequencyMhz: 3200 },
        { id: 1, usage: null, frequencyMhz: null },
      ],
      load: { one: 1.25, five: 0.8, fifteen: 0.5 },
      frequencyMhz: 2400,
      temperatureCelsius: 61,
    },
    memory: {
      totalBytes: 16 * 1024 ** 3,
      usedBytes: 8 * 1024 ** 3,
      availableBytes: 8 * 1024 ** 3,
      cachedBytes: null,
      swapTotalBytes: 1024 ** 3,
      swapUsedBytes: 0,
    },
    temperatures: [
      { id: "hwmon0/temp1", chip: "coretemp", label: "Package", celsius: 61 },
      { id: "hwmon1/temp1", chip: "nvme", label: null, celsius: 92 },
    ],
    filesystems: [
      {
        mountpoint: "/",
        device: "/dev/sda1",
        type: "ext4",
        totalBytes: 100,
        usedBytes: 95,
        availableBytes: 5,
      },
    ],
    disks: [{ name: "sda", readBytesPerSec: 1024, writeBytesPerSec: 2048 }],
    network: [{ name: "eth0", rxBytesPerSec: 4096, txBytesPerSec: 1024 }],
  };
}

const history: MetricHistory = {
  range: "24h",
  resolutionMs: 300_000,
  from: 0,
  to: 600_000,
  ts: [0, 300_000],
  series: {
    cpu: { avg: [10, 20], max: [30, 40] },
    memory: { avg: [50, 55], max: [60, 65] },
    disk: { avg: [70, 70], max: [70, 70] },
    load1: { avg: [null, null], max: [null, null] },
    temperature: { avg: [null, null], max: [null, null] },
    netRx: { avg: [1, 2], max: [3, 4] },
    netTx: { avg: [1, 2], max: [3, 4] },
    diskRead: { avg: [1, 2], max: [3, 4] },
    diskWrite: { avg: [1, 2], max: [3, 4] },
  },
};

function renderPage() {
  return render(<StatsPage themeKey="dark-ice" />, { wrapper: createQueryWrapper().wrapper });
}

beforeEach(() => {
  harness.charts = [];
  vi.mocked(hostApi.fetchHostSnapshot).mockResolvedValue(snapshot(1_000));
  vi.mocked(metricsApi.fetchMetricHistory).mockResolvedValue(history);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StatsPage", () => {
  it("shows the current readings, cores, storage, temperatures and system facts", async () => {
    renderPage();

    const readings = await screen.findByRole("region", { name: "Current readings" });
    expect(within(readings).getByText("42%")).toBeTruthy();
    expect(within(readings).getByText("8.00 GiB of 16.0 GiB · swap 0 B")).toBeTruthy();
    expect(within(readings).getByText("1.25")).toBeTruthy();
    expect(within(readings).getByText("2.40 GHz · 61°C")).toBeTruthy();

    expect(screen.getByRole("listitem", { name: "Core 0: 80 percent" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Core 1: unknown" })).toBeTruthy();
    expect(screen.getByRole("meter", { name: "/ used" }).getAttribute("aria-valuenow")).toBe("95");
    expect(screen.getByText("92°C").className).toContain("text-destructive");
    expect(await screen.findByText("Debian")).toBeTruthy();
  });

  it("lists firing and recent alerts", async () => {
    renderPage();
    const alerts = await screen.findByRole("region", { name: "Alerts" });
    expect(within(alerts).getByText("Disk (/srv) above 85% for 1 min")).toBeTruthy();
    const recent = within(alerts).getByRole("list", { name: "Recent alerts" });
    expect(recent.textContent).toContain("CPU above 90% for 5 min");
    expect(recent.textContent).toContain("1 h 30 min");
    expect(recent.textContent).toContain("peak 98%");
  });

  it("draws live charts over the last five minutes and follows new readings", async () => {
    renderPage();
    await screen.findByRole("button", { name: "CPU over time" });
    act(() => harness.onSnapshot?.(snapshot(2_000, 64)));

    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "CPU chart" })).getByText("64%")
      ).toBeTruthy()
    );
    const cpu = harness.charts.filter((chart) => chart.ariaLabel === "CPU over time").at(-1)!;
    expect(cpu.timeRange).toEqual([2_000 - 300_000, 2_000]);
    expect(screen.getByRole("button", { name: "CPU temperature over time" })).toBeTruthy();
  });

  it("switches to a history range and shows the hovered point", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("region", { name: "Current readings" });

    await user.click(screen.getByRole("radio", { name: "24h" }));
    expect(metricsApi.fetchMetricHistory).toHaveBeenCalledWith("24h");
    const cpuChart = await screen.findByRole("button", { name: "CPU over time" });
    const cpu = harness.charts.filter((chart) => chart.ariaLabel === "CPU over time").at(-1)!;
    expect(cpu.timeRange).toEqual([0, 600_000]);
    expect(cpu.data).toEqual([
      [0, 300_000],
      [30, 40],
      [10, 20],
    ]);
    // This range has no temperature or load history.
    expect(screen.queryByRole("button", { name: "Load over time" })).toBeNull();

    await user.click(cpuChart);
    expect(within(screen.getByRole("region", { name: "CPU chart" })).getByText("10%")).toBeTruthy();
  });

  it("moves through ranges with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPage();
    const live = screen.getByRole("radio", { name: "Live" });
    live.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "1h" }).getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "30d" }).getAttribute("aria-checked")).toBe("true");
  });

  it("explains when host metrics or history cannot load", async () => {
    const user = userEvent.setup();
    vi.mocked(hostApi.fetchHostSnapshot).mockRejectedValue(new Error("offline"));
    vi.mocked(metricsApi.fetchMetricHistory).mockRejectedValue(new Error("no history"));
    renderPage();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Host metrics are unavailable: offline"
    );
    await user.click(screen.getByRole("radio", { name: "7d" }));
    expect(await screen.findByText("History is unavailable: no history")).toBeTruthy();
  });
});
