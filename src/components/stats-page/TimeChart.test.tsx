// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const uplot = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    data: unknown;
    setData: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    cursor: { idx: number | null };
  }> = [];
  class FakeUPlot {
    options: Record<string, unknown>;
    data: unknown;
    setData = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
    cursor = { idx: 3 as number | null };
    constructor(options: Record<string, unknown>, data: unknown) {
      this.options = options;
      this.data = data;
      instances.push(this);
    }
  }
  return { FakeUPlot, instances };
});

vi.mock("uplot", () => ({ default: uplot.FakeUPlot }));
vi.mock("uplot/dist/uPlot.min.css", () => ({}));

import { TimeChart } from "@/components/stats-page/TimeChart";

afterEach(() => {
  cleanup();
  uplot.instances.length = 0;
  vi.restoreAllMocks();
});

function renderChart(overrides: Partial<React.ComponentProps<typeof TimeChart>> = {}) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  const props: React.ComponentProps<typeof TimeChart> = {
    ariaLabel: "CPU over time",
    data: [
      [1, 2],
      [30, 40],
      [10, 20],
    ],
    themeKey: "dark-ice",
    series: [
      { label: "Peak", tone: "brand", band: true },
      { label: "CPU", tone: "brand" },
    ],
    max: 100,
    formatValue: (value) => `${value}%`,
    formatTime: (ms) => `t${ms}`,
    timeRange: [0, 10],
    onHover: vi.fn(),
    ...overrides,
  };
  return { ...render(<TimeChart {...props} />), props };
}

describe("TimeChart", () => {
  it("builds a chart sized to its container with a band, fixed scales and formatted axes", () => {
    renderChart();
    const [chart] = uplot.instances;
    const options = chart.options as {
      width: number;
      bands: Array<{ series: number[] }>;
      series: Array<{ stroke?: string; width?: number }>;
      scales: {
        x: { range: () => number[] };
        y: { range: (u: unknown, min: number, max: number) => number[] };
      };
      axes: Array<{ values: (u: unknown, ticks: number[]) => string[] }>;
    };

    expect(options.width).toBe(400);
    expect(options.bands).toEqual([{ series: [1, 2], fill: expect.any(String) }]);
    expect(options.series[1].stroke).toBe("transparent");
    expect(options.scales.x.range()).toEqual([0, 10]);
    expect(options.scales.y.range(null, 0, 50)).toEqual([0, 100]);
    expect(options.axes[0].values(null, [5])).toEqual(["t5"]);
    expect(options.axes[1].values(null, [25])).toEqual(["25%"]);
  });

  it("fits unbounded values from zero and handles an all-zero series", () => {
    renderChart({ max: undefined });
    const options = uplot.instances[0].options as {
      scales: { y: { range: (u: unknown, min: number, max: number) => number[] } };
    };
    const [low, high] = options.scales.y.range(null, 0, 100);
    expect(low).toBe(0);
    expect(high).toBeCloseTo(115);
    expect(options.scales.y.range(null, 0, 0)).toEqual([0, 1]);
  });

  it("passes new data and hover positions through, and cleans up", () => {
    const { rerender, props, unmount, getByRole } = renderChart();
    const chart = uplot.instances[0];
    const next = [
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ] as React.ComponentProps<typeof TimeChart>["data"];
    rerender(<TimeChart {...props} data={next} />);
    expect(chart.setData).toHaveBeenCalledWith(next);

    const hooks = chart.options.hooks as { setCursor: Array<(u: unknown) => void> };
    hooks.setCursor[0](chart);
    expect(props.onHover).toHaveBeenCalledWith(3);
    fireEvent.pointerLeave(getByRole("img", { name: "CPU over time" }));
    expect(props.onHover).toHaveBeenLastCalledWith(null);

    unmount();
    expect(chart.destroy).toHaveBeenCalled();
  });
});
