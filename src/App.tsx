import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { MetricCharts } from "@/components/MetricCharts";
import { ServicesSection } from "@/components/ServicesSection";
import { Separator } from "@/components/ui/separator";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";

function App() {
  const { samples, latest } = useMetrics();
  const { services, create, update, remove } = useServices();
  const sectionOrderStorageKey = "orbitdash.sectionOrder";
  const [sectionOrder, setSectionOrder] = useLocalStorageState(
    sectionOrderStorageKey,
    "stats-first"
  );
  const showStatsFirst = sectionOrder !== "services-first";

  const statsSection = (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Stats</h2>
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-stretch">
        <div className="space-y-3">
          <MetricCard title="CPU" value={latest?.cpu ?? null} icon="cpu" />
          <MetricCard title="RAM" value={latest?.ram ?? null} icon="ram" />
          <MetricCard title="Disk" value={latest?.disk ?? null} icon="disk" />
        </div>
        <div className="min-w-0 md:h-full">
          <MetricCharts samples={samples} />
        </div>
      </div>
    </div>
  );

  const servicesSection = (
    <ServicesSection
      services={services}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
    />
  );

  return (
    <div className="min-h-svh bg-background">
      <Header
        showStatsFirst={showStatsFirst}
        onToggleSectionOrder={() =>
          setSectionOrder((prev) =>
            prev === "stats-first" ? "services-first" : "stats-first"
          )
        }
      />
      <main className="page-load mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {showStatsFirst ? statsSection : servicesSection}
        <Separator />
        {showStatsFirst ? servicesSection : statsSection}
      </main>
    </div>
  );
}

export default App;
