import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { MetricCharts } from "@/components/MetricCharts";
import { ServicesSection } from "@/components/ServicesSection";
import { Separator } from "@/components/ui/separator";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";

function App() {
  const { samples, latest, status } = useMetrics();
  const { services, create, update, remove } = useServices();

  const statusConfig = {
    connected: { label: "Connected", color: "#73daca" },
    connecting: { label: "Connecting...", color: "#e0af68" },
    offline: { label: "Offline", color: "#f7768e" },
  } as const;

  return (
    <div className="min-h-svh bg-background">
      <Header />
      <main className="page-load mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusConfig[status].color }}
          />
          <span className="text-xs text-muted-foreground">
            {statusConfig[status].label}
          </span>
        </div>

        {/* Metric stat cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="CPU" value={latest?.cpu ?? null} icon="cpu" />
          <MetricCard title="RAM" value={latest?.ram ?? null} icon="ram" />
          <MetricCard title="Disk" value={latest?.disk ?? null} icon="disk" />
        </div>

        {/* Charts */}
        <MetricCharts samples={samples} />

        <Separator />

        {/* Services */}
        <ServicesSection
          services={services}
          onCreate={create}
          onUpdate={update}
          onDelete={remove}
        />
      </main>
    </div>
  );
}

export default App;