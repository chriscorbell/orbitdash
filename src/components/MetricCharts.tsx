import { useMemo, useState } from "react";
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
  cpu: { label: "CPU", color: "#fafafa" },
  ram: { label: "RAM", color: "#fafafa" },
  disk: { label: "Disk", color: "#fafafa" },
} satisfies Record<MetricKey, { color: string; label: string }>;

function createAreaFill(context: ScriptableContext<"line">) {
  const { chart } = context;
  const { chartArea, ctx } = chart;

  if (!chartArea) {
    return "rgba(250, 250, 250, 0.12)";
  }

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(250, 250, 250, 0.3)");
  gradient.addColorStop(1, "rgba(250, 250, 250, 0)");
  return gradient;
}

function MetricLineChart({
  data,
  color,
  label,
  nowTs,
}: {
  data: Array<{ ts: number; value: number }>;
  color: string;
  label: string;
  nowTs: number;
}) {
  const domainStart = data.length > 0 ? data[0].ts : nowTs - 30_000;
  const latestValue = data.at(-1)?.value;
  const chartData = useMemo<ChartData<"line", Array<{ x: number; y: number }>>>(
    () => ({
      datasets: [
        {
          label,
          data: data.map((point) => ({ x: point.ts, y: point.value })),
          borderColor: color,
          backgroundColor: createAreaFill,
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
          backgroundColor: "#18181b",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          bodyColor: "#fafafa",
          cornerRadius: 8,
          displayColors: false,
          padding: 8,
          titleColor: "#a1a1aa",
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
            color: "rgba(255, 255, 255, 0.1)",
            drawTicks: false,
          },
          ticks: {
            color: "#a1a1aa",
            font: { size: 11 },
            padding: 8,
            stepSize: 25,
            callback: (value) => `${value}%`,
          },
        },
      },
    }),
    [domainStart, label, nowTs]
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
              color={activeChart.color}
              label={activeChart.label}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
