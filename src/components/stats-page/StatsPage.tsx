import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TimeChart, type ChartSeries } from "@/components/stats-page/TimeChart";
import { fetchHostSnapshot, subscribeHostSnapshots } from "@/lib/api/host";
import { fetchMetricHistory } from "@/lib/api/history";
import { fetchSystemInfo } from "@/lib/api/system";
import { formatBytes, formatPercent, formatRate, formatUptime } from "@/lib/format";
import {
  appendSnapshot,
  hasReadings,
  latestReading,
  LIVE_WINDOW,
  seriesFromHistory,
  seriesFromSnapshots,
  thresholdTone,
  type ChartColumns,
  type StatsSeries,
} from "@/lib/stats-data";
import { cn } from "@/lib/utils";
import type { HostSnapshot, MetricHistoryRange } from "@shared/types";
import { Activity, Cpu, Gauge, HardDrive, MemoryStick, Network, Thermometer } from "lucide-react";

type StatsRange = "live" | MetricHistoryRange;

const RANGES: Array<{ value: StatsRange; label: string }> = [
  { value: "live", label: "Live" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

// Fresh enough for each range without polling more than its resolution warrants.
const REFRESH_MS: Record<MetricHistoryRange, number> = {
  "1h": 60_000,
  "24h": 5 * 60_000,
  "7d": 15 * 60_000,
  "30d": 15 * 60_000,
};

const TONE_TEXT = {
  critical: "text-destructive",
  none: "text-muted-foreground",
  normal: "text-foreground",
  warning: "text-warning",
} as const;

const TONE_BAR = {
  critical: "bg-destructive",
  none: "bg-muted-foreground",
  normal: "bg-brand",
  warning: "bg-warning",
} as const;

const formatPercentAxis = (value: number) => `${Math.round(value)}%`;
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const formatClock = (ms: number) => clockFormat.format(ms);
const formatDay = (ms: number) => dayFormat.format(ms);
const formatCelsius = (value: number) => `${Math.round(value)}°C`;
const formatLoad = (value: number) => value.toFixed(value < 10 ? 2 : 1);

/** Every reading of the host while the page is open, starting from the latest one. */
function useLiveSnapshots() {
  const [snapshots, setSnapshots] = useState<HostSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHostSnapshot().then(
      (snapshot) => {
        if (active) setSnapshots((current) => appendSnapshot(current, snapshot));
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "Host metrics failed");
      }
    );
    const stop = subscribeHostSnapshots((snapshot) => {
      setError(null);
      setSnapshots((current) => appendSnapshot(current, snapshot));
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  return { snapshots, error };
}

interface StatsPageProps {
  /** Changes with the theme and accent so charts pick up new colors. */
  themeKey: string;
}

/** Host metrics in depth: live or over a range, with per-core, storage and temperature detail. */
export function StatsPage({ themeKey }: StatsPageProps) {
  const [range, setRange] = useState<StatsRange>("live");
  const live = useLiveSnapshots();
  const current = live.snapshots.at(-1) ?? null;

  const history = useQuery({
    queryKey: ["metric-history", range],
    queryFn: () => fetchMetricHistory(range as MetricHistoryRange),
    enabled: range !== "live",
    refetchInterval: range === "live" ? false : REFRESH_MS[range],
    staleTime: 30_000,
  });

  // Live shows the last five minutes; ranges show their whole window.
  const lastLiveTs = current?.ts ?? null;
  const timeRange = useMemo<[number, number] | null>(() => {
    if (range === "live") {
      return lastLiveTs === null ? null : [lastLiveTs - LIVE_WINDOW * 1000, lastLiveTs];
    }
    return history.data ? [history.data.from, history.data.to] : null;
  }, [history.data, lastLiveTs, range]);

  const series = useMemo<StatsSeries | null>(() => {
    if (range === "live") return seriesFromSnapshots(live.snapshots);
    return history.data ? seriesFromHistory(history.data) : null;
  }, [history.data, live.snapshots, range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Stats</h1>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {live.error && !current && (
        <p role="alert" className="text-sm text-destructive">
          Host metrics are unavailable: {live.error}
        </p>
      )}

      <SummaryTiles snapshot={current} />

      {range !== "live" && history.error && (
        <p role="alert" className="text-sm text-destructive">
          History is unavailable: {history.error.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {CHARTS.filter(
          (chart) => !chart.optional || (series && hasReadings(chart.optional(series)))
        ).map((chart) => (
          <ChartCard
            key={chart.title}
            chart={chart}
            formatTime={range === "7d" || range === "30d" ? formatDay : formatClock}
            timeRange={timeRange}
            series={series}
            themeKey={themeKey}
            loading={range !== "live" && history.isPending}
          />
        ))}
      </div>

      {current && current.cpu.cores.length > 0 && <CoreHeatStrip snapshot={current} />}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <StorageList snapshot={current} />
          <SystemFacts />
        </div>
        <TemperatureList snapshot={current} />
      </div>
    </div>
  );
}

interface ChartDefinition {
  title: string;
  Icon: typeof Cpu;
  columns: (series: StatsSeries) => ChartColumns;
  series: ChartSeries[];
  /** Fixed 0..max scale, for percentages. */
  max?: number;
  formatAxis: (value: number) => string;
  /** The readout for one point: one value per chart series, in order. */
  formatReading: (values: Array<number | null>) => string;
  /** Shown only when this series has readings (not every host reports it). */
  optional?: (series: StatsSeries) => Array<number | null>;
}

const percentReading = (value: number | null) =>
  value === null ? "–" : `${formatPercent(value)}%`;

const CHARTS: ChartDefinition[] = [
  {
    title: "CPU",
    Icon: Cpu,
    columns: (data) => [data.ts, data.cpuMax, data.cpu],
    series: [
      { label: "Peak", tone: "brand", band: true },
      { label: "CPU", tone: "brand" },
    ],
    max: 100,
    formatAxis: formatPercentAxis,
    formatReading: (values) => percentReading(values[1]),
  },
  {
    title: "Memory",
    Icon: MemoryStick,
    columns: (data) => [data.ts, data.memory],
    series: [{ label: "Memory", tone: "brand" }],
    max: 100,
    formatAxis: formatPercentAxis,
    formatReading: (values) => percentReading(values[0]),
  },
  {
    title: "Network",
    Icon: Network,
    columns: (data) => [data.ts, data.netRx, data.netTx],
    series: [
      { label: "In", tone: "brand" },
      { label: "Out", tone: "muted" },
    ],
    formatAxis: formatRate,
    formatReading: (values) =>
      `In ${formatRate(values[0] ?? 0)} · Out ${formatRate(values[1] ?? 0)}`,
  },
  {
    title: "Disk activity",
    Icon: HardDrive,
    columns: (data) => [data.ts, data.diskRead, data.diskWrite],
    series: [
      { label: "Read", tone: "brand" },
      { label: "Write", tone: "muted" },
    ],
    formatAxis: formatRate,
    formatReading: (values) =>
      `Read ${formatRate(values[0] ?? 0)} · Write ${formatRate(values[1] ?? 0)}`,
  },
  {
    title: "CPU temperature",
    Icon: Thermometer,
    columns: (data) => [data.ts, data.temperature],
    series: [{ label: "Temperature", tone: "brand" }],
    formatAxis: formatCelsius,
    formatReading: (values) => (values[0] === null ? "–" : formatCelsius(values[0])),
    optional: (data) => data.temperature,
  },
  {
    title: "Load",
    Icon: Gauge,
    columns: (data) => [data.ts, data.load1],
    series: [{ label: "Load", tone: "brand" }],
    formatAxis: formatLoad,
    formatReading: (values) => (values[0] === null ? "–" : formatLoad(values[0])),
    optional: (data) => data.load1,
  },
];

function RangePicker({
  value,
  onChange,
}: {
  value: StatsRange;
  onChange: (range: StatsRange) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1"
      onKeyDown={(event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const index = RANGES.findIndex((range) => range.value === value);
        const next = (index + step + RANGES.length) % RANGES.length;
        onChange(RANGES[next].value);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}
    >
      {RANGES.map((range) => {
        const selected = range.value === value;
        return (
          <button
            key={range.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(range.value)}
            className={cn(
              "rounded-md px-3 py-1 font-mono text-xs font-medium transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2",
              selected
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}

function Tile({
  label,
  Icon,
  value,
  detail,
  tone = "normal",
}: {
  label: string;
  Icon: typeof Cpu;
  value: string;
  detail?: string;
  tone?: keyof typeof TONE_TEXT;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-3.5 py-3 shadow-xs">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", TONE_TEXT[tone])}>
        {value}
      </p>
      {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function SummaryTiles({ snapshot }: { snapshot: HostSnapshot | null }) {
  const cpu = snapshot?.cpu.usage ?? null;
  const memory = snapshot?.memory ?? null;
  const memoryPercent = memory ? (memory.usedBytes / memory.totalBytes) * 100 : null;
  const load = snapshot?.cpu.load ?? null;
  const rx = snapshot?.network.reduce((total, entry) => total + (entry.rxBytesPerSec ?? 0), 0);
  const tx = snapshot?.network.reduce((total, entry) => total + (entry.txBytesPerSec ?? 0), 0);
  const cpuDetail = [
    snapshot?.cpu.frequencyMhz ? `${(snapshot.cpu.frequencyMhz / 1000).toFixed(2)} GHz` : null,
    snapshot?.cpu.temperatureCelsius != null
      ? formatCelsius(snapshot.cpu.temperatureCelsius)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Current readings" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="CPU"
        Icon={Cpu}
        value={cpu === null ? "–" : `${formatPercent(cpu)}%`}
        detail={cpuDetail || undefined}
        tone={thresholdTone(cpu, 70, 90)}
      />
      <Tile
        label="Memory"
        Icon={MemoryStick}
        value={memoryPercent === null ? "–" : `${formatPercent(memoryPercent)}%`}
        detail={
          memory
            ? `${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)}${
                memory.swapTotalBytes ? ` · swap ${formatBytes(memory.swapUsedBytes ?? 0)}` : ""
              }`
            : undefined
        }
        tone={thresholdTone(memoryPercent, 75, 90)}
      />
      <Tile
        label="Load"
        Icon={Gauge}
        value={load ? formatLoad(load.one) : "–"}
        detail={load ? `${formatLoad(load.five)} · ${formatLoad(load.fifteen)}` : undefined}
      />
      <Tile
        label="Network"
        Icon={Activity}
        value={rx === undefined ? "–" : formatRate(rx)}
        detail={tx === undefined ? undefined : `${formatRate(tx)} sent`}
      />
    </section>
  );
}

interface ChartCardProps {
  chart: ChartDefinition;
  formatTime: (ms: number) => string;
  timeRange: [number, number] | null;
  loading: boolean;
  series: StatsSeries | null;
  themeKey: string;
}

const ChartCard = memo(function ChartCard({
  chart,
  formatTime,
  timeRange,
  loading,
  series,
  themeKey,
}: ChartCardProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { columns, formatReading, title, Icon } = chart;
  const data = useMemo(() => (series ? columns(series) : null), [columns, series]);
  const ts = data?.[0] ?? [];
  const values = data ? data.slice(1) : [];
  // The hovered point, or the latest reading of each series.
  const reading =
    data && ts.length > 0
      ? formatReading(
          values.map((column) =>
            hovered === null ? latestReading(column) : (column[hovered] ?? null)
          )
        )
      : "–";
  const at =
    hovered !== null && ts[hovered]
      ? new Date(ts[hovered]).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs" aria-label={`${title} chart`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
          <Icon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </h2>
        <p className="min-w-0 truncate font-mono text-xs tabular-nums text-muted-foreground">
          {at && <span className="mr-2">{at}</span>}
          <span className="text-foreground">{reading}</span>
        </p>
      </div>
      {loading ? (
        <div className="h-[168px] animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
      ) : !data || ts.length === 0 ? (
        <div className="flex h-[168px] items-center justify-center text-sm text-muted-foreground">
          No readings yet
        </div>
      ) : (
        <TimeChart
          ariaLabel={`${title} over time`}
          data={data}
          themeKey={themeKey}
          series={chart.series}
          max={chart.max}
          formatValue={chart.formatAxis}
          formatTime={formatTime}
          timeRange={timeRange ?? [ts[0], ts[ts.length - 1]]}
          onHover={setHovered}
        />
      )}
    </section>
  );
});

function CoreHeatStrip({ snapshot }: { snapshot: HostSnapshot }) {
  const cores = snapshot.cpu.cores;
  return (
    <section aria-label="CPU cores" className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="mb-3 flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <Cpu aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          Cores
        </span>
        <span className="font-mono text-xs text-muted-foreground">{cores.length}</span>
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
        {cores.map((core) => {
          const usage = core.usage ?? 0;
          return (
            <li
              key={core.id}
              aria-label={`Core ${core.id}: ${core.usage === null ? "unknown" : `${Math.round(usage)} percent`}`}
              title={`Core ${core.id}${core.frequencyMhz ? ` · ${(core.frequencyMhz / 1000).toFixed(2)} GHz` : ""}`}
              className="flex h-9 items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-[background-color] duration-500 motion-reduce:transition-none"
              style={{
                backgroundColor: `color-mix(in oklab, var(--brand) ${Math.round(8 + usage * 0.8)}%, var(--muted))`,
                color: usage > 55 ? "var(--brand-foreground)" : undefined,
              }}
            >
              {core.usage === null ? "–" : Math.round(usage)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StorageList({ snapshot }: { snapshot: HostSnapshot | null }) {
  const filesystems = snapshot?.filesystems ?? [];
  return (
    <section aria-label="Storage" className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <HardDrive aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        Storage
      </h2>
      {filesystems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No filesystems reported.</p>
      ) : (
        <ul className="space-y-3">
          {filesystems.map((filesystem) => {
            const percent =
              filesystem.totalBytes > 0 ? (filesystem.usedBytes / filesystem.totalBytes) * 100 : 0;
            const tone = thresholdTone(percent, 75, 90);
            return (
              <li key={filesystem.mountpoint} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-mono" title={filesystem.device}>
                    {filesystem.mountpoint}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatBytes(filesystem.usedBytes)} / {formatBytes(filesystem.totalBytes)}
                    <span className={cn("ml-2", TONE_TEXT[tone])}>{Math.round(percent)}%</span>
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`${filesystem.mountpoint} used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      TONE_BAR[tone]
                    )}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TemperatureList({ snapshot }: { snapshot: HostSnapshot | null }) {
  const temperatures = snapshot?.temperatures ?? [];
  if (temperatures.length === 0) return null;
  return (
    <section aria-label="Temperatures" className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Thermometer aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        Temperatures
      </h2>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {temperatures.map((sensor) => (
          <li
            key={sensor.id}
            title={`${sensor.chip}${sensor.label ? ` · ${sensor.label}` : ""}`}
            className="flex min-w-0 items-baseline justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {sensor.label ?? sensor.chip}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-xs tabular-nums",
                TONE_TEXT[thresholdTone(sensor.celsius, 70, 85)]
              )}
            >
              {formatCelsius(sensor.celsius)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SystemFacts() {
  const { data } = useQuery({ queryKey: ["system"], queryFn: fetchSystemInfo, staleTime: 600_000 });
  const facts = data
    ? [
        ["Host", data.hostname],
        ["System", data.osName],
        ["Kernel", data.kernel],
        ["Processor", data.cpuModel ? `${data.cpuModel} · ${data.cpuCount} threads` : null],
        ["Up", formatUptime(data.uptimeSeconds)],
      ].filter((fact): fact is [string, string] => Boolean(fact[1]))
    : [];
  if (facts.length === 0) return null;
  return (
    <section aria-label="System" className="rounded-xl border bg-card p-4 shadow-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate font-mono text-xs leading-5" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
