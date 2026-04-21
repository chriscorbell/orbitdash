import { Fragment, lazy, Suspense } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { ServicesSection } from "@/components/ServicesSection";
import { SectionStateCard } from "@/components/common/SectionStateCard";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";

function getInitialServicesFirst() {
  try {
    const legacySectionOrder = window.localStorage.getItem("orbitdash.sectionOrder");

    if (legacySectionOrder === "services-first") {
      return true;
    }

    if (legacySectionOrder === "stats-first") {
      return false;
    }
  } catch {
    // Ignore storage access issues.
  }

  return true;
}

const MetricCharts = lazy(() =>
  import("@/components/MetricCharts").then((module) => ({
    default: module.MetricCharts,
  }))
);

function MetricChartsFallback() {
  return <Card size="sm" className="h-full min-h-45 py-2" />;
}

function App() {
  const {
    samples,
    latest,
    status: metricsStatus,
    error: metricsError,
    recoveredAt: metricsRecoveredAt,
  } = useMetrics();
  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    create,
    update,
    remove,
    reload,
  } = useServices();
  const categoryOrder = useCategoryOrder(services);
  const [servicesFirst, setServicesFirst] = useLocalStorageState(
    "orbitdash.servicesFirst",
    getInitialServicesFirst
  );
  const [showStatsSection, setShowStatsSection] = useLocalStorageState(
    "orbitdash.showStatsSection",
    true
  );
  const [showServicesSection, setShowServicesSection] = useLocalStorageState(
    "orbitdash.showServicesSection",
    true
  );
  const [gridColumns, setGridColumns] = useLocalStorageState<"4" | "5">(
    "orbitdash.servicesGrid",
    "4"
  );
  const columnCount = gridColumns === "5" ? 5 : 4;
  const isFiveColumn = columnCount === 5;
  const canReorderCategories = categoryOrder.namedCategories.length >= 2;
  const showMetricsConnecting =
    metricsStatus === "connecting" && samples.length === 0 && !metricsError;
  const showMetricsError = metricsError !== null && samples.length === 0;
  const showMetricsOffline = metricsStatus === "offline";
  const showMetricsWarning = metricsError !== null && samples.length > 0;
  const showMetricsRecovered = metricsRecoveredAt !== null && !showMetricsOffline;

  const statsSection = (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Stats</h2>
      {showMetricsConnecting && (
        <SectionStateCard
          tone="loading"
          title="Connecting to live metrics"
          description="Waiting for the first metrics snapshot and stream updates."
        />
      )}
      {showMetricsError && (
        <SectionStateCard tone="error" title="Metrics are unavailable" description={metricsError} />
      )}
      {showMetricsOffline && (
        <SectionStateCard
          tone="offline"
          title="Metrics stream offline"
          description="Showing the last received samples while the connection recovers."
        />
      )}
      {showMetricsWarning && !showMetricsOffline && (
        <SectionStateCard tone="error" title="Metrics may be stale" description={metricsError} />
      )}
      {showMetricsRecovered && !showMetricsConnecting && !showMetricsWarning && (
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

  const servicesSection = (
    <ServicesSection
      services={services}
      categoryOrder={categoryOrder}
      loading={servicesLoading}
      error={servicesError}
      isFiveColumn={isFiveColumn}
      onRetry={reload}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
    />
  );

  const orderedSections = servicesFirst
    ? [
        { key: "services", visible: showServicesSection, content: servicesSection },
        { key: "stats", visible: showStatsSection, content: statsSection },
      ]
    : [
        { key: "stats", visible: showStatsSection, content: statsSection },
        { key: "services", visible: showServicesSection, content: servicesSection },
      ];

  const visibleSections = orderedSections.filter((section) => section.visible);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header
        canReorderCategories={canReorderCategories}
        columnCount={columnCount}
        isCategoryOrderBusy={categoryOrder.loading || categoryOrder.saving}
        isReorderMode={categoryOrder.isReorderMode}
        servicesFirst={servicesFirst}
        showServicesSection={showServicesSection}
        showStatsSection={showStatsSection}
        onColumnCountChange={(nextColumnCount) =>
          setGridColumns(String(nextColumnCount) as "4" | "5")
        }
        onServicesFirstChange={setServicesFirst}
        onShowServicesSectionChange={setShowServicesSection}
        onShowStatsSectionChange={setShowStatsSection}
        onToggleReorder={
          categoryOrder.isReorderMode ? categoryOrder.cancelReorder : categoryOrder.beginReorder
        }
      />
      <main className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {visibleSections.length === 0 ? (
          <Card size="sm" className="border-dashed">
            <CardContent className="space-y-1 py-1">
              <CardTitle className="text-sm font-semibold">Nothing is visible</CardTitle>
              <CardDescription>
                Turn on the Stats section or Services section in Settings to show dashboard content.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          visibleSections.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && <Separator />}
              {section.content}
            </Fragment>
          ))
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
