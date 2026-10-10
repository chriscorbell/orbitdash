import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MetricSample } from "@shared/types";
import { ChartSpline } from "lucide-react";

interface MetricChartsProps {
  samples: MetricSample[];
}

type MetricKey = "cpu" | "ram" | "disk";

ChartJS.register(Filler, LineElement, LinearScale, PointElement, Tooltip);

function isMetricKey(value: string): value is MetricKey {
  return value === "cpu" || value === "ram" || value === "disk";
}

const chartConfig = {
  cpu: { label: "CPU" },
  ram: { label: "RAM" },
  disk: { label: "Disk" },
} satisfies Record<MetricKey, { label: string }>;

interface ChartColors {
  border: string;
  brand: string;
  muted: string;
  popover: string;
  popoverForeground: string;
}

/** Canvas can't read CSS variables, so resolve the theme tokens to concrete colors. */
function readChartColors(): ChartColors {
  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const resolve = (token: string, fallback: string) => {
    probe.style.color = `var(${token}, ${fallback})`;
    return getComputedStyle(probe).color || fallback;
  };
  const colors = {
    border: resolve("--border", "rgba(255,255,255,0.1)"),
    brand: resolve("--brand", "#8cc8ee"),
    muted: resolve("--muted-foreground", "#a1a1aa"),
    popover: resolve("--popover", "#18181b"),
    popoverForeground: resolve("--popover-foreground", "#fafafa"),
  };
  probe.remove();
  return colors;
}

/** The same color at a given opacity, for canvas gradients. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  if (color.includes("(") && !color.includes("/")) return color.replace(/\)$/, ` / ${alpha})`);
  return color;
}

/** Chart colors that follow theme and accent changes on <html>. */
function useChartColors(): ChartColors {
  const [colors, setColors] = useState(readChartColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readChartColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}

function createAreaFill(brand: string) {
  return (context: ScriptableContext<"line">) => {
    const { chartArea, ctx } = context.chart;
    if (!chartArea) {
      return withAlpha(brand, 0.12);
    }

    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, withAlpha(brand, 0.3));
    gradient.addColorStop(1, withAlpha(brand, 0));
    return gradient;
  };
}

function MetricLineChart({
  colors,
  data,
  label,
  nowTs,
}: {
  colors: ChartColors;
  data: Array<{ ts: number; value: number }>;
  label: string;
  nowTs: number;
}) {
  const color = colors.brand;
  const domainStart = data.length > 0 ? data[0].ts : nowTs - 30_000;
  const latestValue = data.at(-1)?.value;
  const chartData = useMemo<ChartData<"line", Array<{ x: number; y: number }>>>(
    () => ({
      datasets: [
        {
          label,
          data: data.map((point) => ({ x: point.ts, y: point.value })),
          borderColor: color,
          backgroundColor: createAreaFill(color),
          borderWidth: 3,
          cubicInterpolationMode: "monotone",
          fill: true,
          pointRadius: 0,
          pointHoverBackgroundColor: color,
          pointHoverBorderWidth: 0,
          pointHoverRadius: 3,
        },
      ],
    }),
    [color, data, label]
  );
  const options = useMemo<ChartOptions<"line">>(
    () => ({
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { axis: "x", intersect: false, mode: "nearest" },
      layout: { padding: { top: 8, right: 8, bottom: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.popover,
          borderColor: colors.border,
          borderWidth: 1,
          bodyColor: colors.popoverForeground,
          cornerRadius: 8,
          displayColors: false,
          padding: 8,
          titleColor: colors.muted,
          callbacks: {
            title: ([item]) => {
              if (!item) return "";
              return `${Math.max(0, Math.round((nowTs - Number(item.parsed.x)) / 1000))}s ago`;
            },
            label: (item) => `${label}: ${Number(item.parsed.y).toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          display: false,
          min: domainStart,
          max: nowTs,
        },
        y: {
          min: 0,
          max: 100,
          border: { display: false },
          grid: {
            color: colors.border,
            drawTicks: false,
          },
          ticks: {
            color: colors.muted,
            font: { size: 11 },
            padding: 8,
            stepSize: 25,
            callback: (value) => `${value}%`,
          },
        },
      },
    }),
    [colors, domainStart, label, nowTs]
  );

  return (
    <div className="relative min-h-45 h-45 w-full">
      <Line
        aria-label={`${label} usage over the last 30 seconds${latestValue === undefined ? "" : `, latest ${latestValue.toFixed(1)}%`}`}
        data={chartData}
        fallbackContent={`${label} usage chart`}
        options={options}
        role="img"
      />
    </div>
  );
}

export function MetricCharts({ samples }: MetricChartsProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("cpu");
  const colors = useChartColors();
  const nowTs = samples.length > 0 ? samples[samples.length - 1].ts : 30_000;

  const cpuData = useMemo(() => samples.map((s) => ({ ts: s.ts, value: s.cpu })), [samples]);

  const ramData = useMemo(() => samples.map((s) => ({ ts: s.ts, value: s.ram })), [samples]);

  const diskData = useMemo(() => samples.map((s) => ({ ts: s.ts, value: s.disk })), [samples]);

  const chartData = {
    cpu: cpuData,
    ram: ramData,
    disk: diskData,
  } satisfies Record<MetricKey, Array<{ ts: number; value: number }>>;

  const activeChart = chartConfig[activeMetric];

  return (
    <Card size="sm" className="h-full py-2">
      <Tabs
        value={activeMetric}
        onValueChange={(value) => {
          if (isMetricKey(value)) {
            setActiveMetric(value);
          }
        }}
        className="h-full"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ChartSpline className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-muted-foreground">Metrics</CardTitle>
          </div>
          <TabsList className="h-5! min-h-0! rounded-md p-px!">
            <TabsTrigger
              value="cpu"
              className="h-4.5! min-h-0! rounded-[5px] px-1.5 py-0 text-[10px] leading-none font-semibold"
            >
              CPU
            </TabsTrigger>
            <TabsTrigger
              value="ram"
              className="h-4.5! min-h-0! rounded-[5px] px-1.5 py-0 text-[10px] leading-none font-semibold"
            >
              RAM
            </TabsTrigger>
            <TabsTrigger
              value="disk"
              className="h-4.5! min-h-0! rounded-[5px] px-1.5 py-0 text-[10px] leading-none font-semibold"
            >
              Disk
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 pb-0">
          <TabsContent value={activeMetric} className="mt-0 h-full">
            <MetricLineChart
              data={chartData[activeMetric]}
              nowTs={nowTs}
              colors={colors}
              label={activeChart.label}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
