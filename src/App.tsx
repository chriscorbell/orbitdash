import { lazy, Suspense } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { ServicesSection } from "@/components/ServicesSection";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";

const MetricCharts = lazy(() =>
  import("@/components/MetricCharts").then((module) => ({
    default: module.MetricCharts,
  }))
);

function MetricChartsFallback() {
  return <Card size="sm" className="h-full min-h-45 py-2" />;
}

function App() {
  const { samples, latest } = useMetrics();
  const { services, create, update, remove } = useServices();
  const categoryOrder = useCategoryOrder(services);
  const sectionOrderStorageKey = "orbitdash.sectionOrder";
  const [sectionOrder, setSectionOrder] = useLocalStorageState(
    sectionOrderStorageKey,
    "stats-first"
  );
  const [gridColumns, setGridColumns] = useLocalStorageState("orbitdash.servicesGrid", "4");
  const showStatsFirst = sectionOrder !== "services-first";
  const isFiveColumn = gridColumns === "5";
  const canReorderCategories = categoryOrder.namedCategories.length >= 2;

  const statsSection = (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Stats</h2>
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
      isFiveColumn={isFiveColumn}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
    />
  );

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header
        canReorderCategories={canReorderCategories}
        columnCount={isFiveColumn ? 5 : 4}
        isCategoryOrderBusy={categoryOrder.loading || categoryOrder.saving}
        isReorderMode={categoryOrder.isReorderMode}
        showStatsFirst={showStatsFirst}
        onToggleGrid={() => setGridColumns((prev) => (prev === "5" ? "4" : "5"))}
        onToggleReorder={
          categoryOrder.isReorderMode ? categoryOrder.cancelReorder : categoryOrder.beginReorder
        }
        onToggleSectionOrder={() =>
          setSectionOrder((prev) => (prev === "stats-first" ? "services-first" : "stats-first"))
        }
      />
      <main className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {showStatsFirst ? statsSection : servicesSection}
        <Separator />
        {showStatsFirst ? servicesSection : statsSection}
      </main>
      <Footer />
    </div>
  );
}

export default App;
