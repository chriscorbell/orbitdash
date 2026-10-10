import { lazy, Suspense, useState } from "react";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/header/AppHeader";
import { ServicesSection } from "@/components/ServicesSection";
import { loadSettingsDialog } from "@/components/settings/settings-preload";
import { StatsStrip } from "@/components/stats/StatsStrip";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useLiveQueries } from "@/hooks/useLiveQueries";
import { useServices } from "@/hooks/useServices";
import { useAppliedAppearance } from "@/lib/theme";

const SettingsDialog = lazy(() =>
  loadSettingsDialog().then((module) => ({ default: module.SettingsDialog }))
);

function App() {
  useLiveQueries();
  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    create,
    update,
    duplicate,
    remove,
    restore,
    renameCategory,
    reload,
  } = useServices();
  const categoryOrder = useCategoryOrder(services);
  const {
    error: settingsError,
    scope: settingsScope,
    settings,
    setScope: setSettingsScope,
    updateAppearance,
    updateLayout,
  } = useDashboardSettings();
  useAppliedAppearance(settings.appearance);
  const { density, mode, statsPosition, showServices, showStats } = settings.layout;

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Mounted on first open and kept, so closing still plays the exit animation.
  const [settingsMounted, setSettingsMounted] = useState(false);
  const openSettings = () => {
    setSettingsMounted(true);
    setSettingsOpen(true);
  };

  const stats = showStats ? <StatsStrip /> : null;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader
        search={search}
        onAddService={() => setAddOpen(true)}
        onOpenSettings={openSettings}
        onSearchChange={setSearch}
      />
      <main className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {statsPosition === "top" && stats}
        {showServices && (
          <ServicesSection
            services={services}
            categoryOrder={categoryOrder}
            loading={servicesLoading}
            error={servicesError}
            density={density}
            mode={mode}
            search={search}
            addOpen={addOpen}
            onAddOpenChange={setAddOpen}
            onSearchChange={setSearch}
            onRetry={reload}
            onCreate={create}
            onUpdate={update}
            onDelete={remove}
            onRestore={restore}
            onDuplicate={duplicate}
            onRenameCategory={renameCategory}
          />
        )}
        {statsPosition === "bottom" && stats}
        {!showServices && !showStats && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <p className="text-sm font-medium">Nothing is shown right now</p>
            <Button variant="outline" size="sm" onClick={openSettings}>
              Open settings
            </Button>
          </div>
        )}
      </main>
      <Footer />
      {settingsMounted && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            appearance={settings.appearance}
            categoryOrder={categoryOrder}
            density={density}
            mode={mode}
            statsPosition={statsPosition}
            settingsError={settingsError}
            settingsScope={settingsScope}
            showServicesSection={showServices}
            showStatsSection={showStats}
            onAppearanceChange={updateAppearance}
            onDensityChange={(value) => updateLayout({ density: value })}
            onModeChange={(value) => updateLayout({ mode: value })}
            onStatsPositionChange={(position) => updateLayout({ statsPosition: position })}
            onSettingsScopeChange={setSettingsScope}
            onShowServicesSectionChange={(visible) => updateLayout({ showServices: visible })}
            onShowStatsSectionChange={(visible) => updateLayout({ showStats: visible })}
          />
        </Suspense>
      )}
      <Toaster />
    </div>
  );
}

export default App;
