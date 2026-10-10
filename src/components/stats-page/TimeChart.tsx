import { useEffect, useLayoutEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { withAlpha, type ChartColumns } from "@/lib/stats-data";

export interface ChartSeries {
  label: string;
  /** "brand" for the main series, "muted" for a second one alongside it. */
  tone: "brand" | "muted";
  /** Draw this series only as a faint band down to the next series (e.g. peaks over averages). */
  band?: boolean;
}

interface TimeChartProps {
  ariaLabel: string;
  data: ChartColumns;
  /** Changes when the theme or accent changes, so colors are read again. */
  themeKey: string;
  series: ChartSeries[];
  /** Fixed 0..max scale (percentages); otherwise it fits the data from zero. */
  max?: number;
  formatValue: (value: number) => string;
  /** Labels for the time axis, e.g. clock times for short ranges and dates for long ones. */
  formatTime: (ms: number) => string;
  /** The window to show, so the axis stays put while data fills in. */
  timeRange: [number, number];
  height?: number;
  onHover?: (index: number | null) => void;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A time series chart drawn with uPlot, sized to its container. */
export function TimeChart({
  ariaLabel,
  data,
  themeKey,
  series,
  max,
  formatValue,
  formatTime,
  timeRange,
  height = 168,
  onHover,
}: TimeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [width, setWidth] = useState(0);
  const latest = useRef({ data, formatTime, formatValue, onHover, timeRange });
  useEffect(() => {
    latest.current = { data, formatTime, formatValue, onHover, timeRange };
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWidth(container.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Built once per theme and series layout; data updates go through setData below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || width === 0) return;

    const brand = cssVar("--brand") || "#49a9df";
    const muted = cssVar("--muted-foreground") || "#8b93a1";
    const grid = cssVar("--border") || "rgba(255,255,255,0.08)";
    const colorFor = (tone: ChartSeries["tone"]) => (tone === "brand" ? brand : muted);
    const axis: uPlot.Axis = {
      stroke: muted,
      grid: { stroke: grid, width: 1 },
      ticks: { show: false },
      font: '11px "Geist Mono Variable", ui-monospace, monospace',
      gap: 6,
    };

    const bands: uPlot.Band[] = [];
    series.forEach((entry, index) => {
      if (entry.band && index + 1 < series.length) {
        bands.push({ series: [index + 1, index + 2], fill: withAlpha(colorFor(entry.tone), 0.12) });
      }
    });

    const chart = new uPlot(
      {
        width,
        height,
        ms: 1,
        padding: [8, 4, 0, 0],
        legend: { show: false },
        cursor: {
          drag: { x: false, y: false },
          points: { size: 6, fill: brand, stroke: brand },
        },
        scales: {
          x: { time: true, range: () => latest.current.timeRange },
          y: {
            range: (_chart, _min, dataMax) =>
              max !== undefined ? [0, max] : [0, dataMax > 0 ? dataMax * 1.15 : 1],
          },
        },
        axes: [
          {
            ...axis,
            space: 72,
            values: (_chart, ticks) => ticks.map((tick) => latest.current.formatTime(tick)),
          },
          {
            ...axis,
            size: 80,
            values: (_chart, ticks) => ticks.map((tick) => latest.current.formatValue(tick)),
          },
        ],
        series: [
          {},
          ...series.map((entry): uPlot.Series => ({
            label: entry.label,
            stroke: entry.band ? "transparent" : colorFor(entry.tone),
            width: entry.band ? 0 : 1.5,
            fill:
              !entry.band && entry.tone === "brand"
                ? withAlpha(colorFor(entry.tone), 0.1)
                : undefined,
            points: { show: false },
            spanGaps: false,
          })),
        ],
        bands,
        hooks: {
          setCursor: [(chart) => latest.current.onHover?.(chart.cursor.idx ?? null)],
        },
      },
      latest.current.data as uPlot.AlignedData,
      container
    );
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // Rebuilt for layout and theme only; size and data have their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, max, height, series.length, width === 0]);

  useEffect(() => {
    if (width > 0) chartRef.current?.setSize({ width, height });
  }, [height, width]);

  useEffect(() => {
    chartRef.current?.setData(data as uPlot.AlignedData);
  }, [data]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      style={{ height }}
      onPointerLeave={() => onHover?.(null)}
    />
  );
}
