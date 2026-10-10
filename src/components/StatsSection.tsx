import { lazy, Suspense } from "react";
import { MetricCard } from "@/components/MetricCard";
import { SectionStateCard } from "@/components/common/SectionStateCard";
import { Card } from "@/components/ui/card";
import { useMetrics } from "@/hooks/useMetrics";

const MetricCharts = lazy(() =>
  import("@/components/MetricCharts").then((module) => ({
    default: module.MetricCharts,
  }))
);

function MetricChartsFallback() {
  return <Card size="sm" className="h-full min-h-45 py-2" />;
}

/** The only part of the page that subscribes to live metrics, so samples re-render just this. */
export function StatsSection() {
  const { samples, latest, status, error, recoveredAt } = useMetrics();
  const showConnecting = status === "connecting" && samples.length === 0 && !error;
  const showError = error !== null && samples.length === 0;
  const showOffline = status === "offline";
  const showWarning = error !== null && samples.length > 0;
  const showRecovered = recoveredAt !== null && !showOffline;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Stats</h2>
      {showConnecting && (
        <SectionStateCard
          tone="loading"
          title="Connecting to live metrics"
          description="Waiting for the first metrics snapshot and stream updates."
        />
      )}
      {showError && (
        <SectionStateCard tone="error" title="Metrics are unavailable" description={error} />
      )}
      {showOffline && (
        <SectionStateCard
          tone="offline"
          title="Metrics stream offline"
          description="Showing the last received samples while the connection recovers."
        />
      )}
      {showWarning && !showOffline && (
        <SectionStateCard tone="error" title="Metrics may be stale" description={error} />
      )}
      {showRecovered && !showConnecting && !showWarning && (
        <SectionStateCard
          tone="success"
          title="Metrics stream restored"
          description="Live updates have resumed after the last interruption."
        />
      )}
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-stretch">
        <div className="grid gap-3 md:h-full md:grid-rows-3">
          <MetricCard className="h-full" title="CPU" value={latest?.cpu ?? null} icon="cpu" />
          <MetricCard className="h-full" title="RAM" value={latest?.ram ?? null} icon="ram" />
          <MetricCard className="h-full" title="Disk" value={latest?.disk ?? null} icon="disk" />
        </div>
        <div className="min-w-0 md:h-full">
          <Suspense fallback={<MetricChartsFallback />}>
            <MetricCharts samples={samples} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
