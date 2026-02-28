import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { MetricCharts } from "@/components/MetricCharts";
import { ServicesSection } from "@/components/ServicesSection";
import { Separator } from "@/components/ui/separator";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";
import { useEffect, useState } from "react";

function App() {
  const { samples, latest } = useMetrics();
  const { services, create, update, remove } = useServices();
  const sectionOrderStorageKey = "orbitdash.sectionOrder";
  const [showStatsFirst, setShowStatsFirst] = useState(() => {
    try {
      return window.localStorage.getItem(sectionOrderStorageKey) !== "services-first";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        sectionOrderStorageKey,
        showStatsFirst ? "stats-first" : "services-first"
      );
    } catch {
      // Ignore storage access issues.
    }
  }, [showStatsFirst]);

  const statsSection = (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="CPU" value={latest?.cpu ?? null} icon="cpu" />
        <MetricCard title="RAM" value={latest?.ram ?? null} icon="ram" />
        <MetricCard title="Disk" value={latest?.disk ?? null} icon="disk" />
      </div>
      <MetricCharts samples={samples} />
    </>
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
        onToggleSectionOrder={() => setShowStatsFirst((prev) => !prev)}
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