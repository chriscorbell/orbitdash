import { lazy, Suspense, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/header/AppHeader";
import { ServicesSection } from "@/components/ServicesSection";
import { loadSettingsDialog } from "@/components/settings/settings-preload";
import { StatsStrip } from "@/components/stats/StatsStrip";
import { Wallpaper } from "@/components/Wallpaper";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { useCategories } from "@/hooks/useCategories";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useLiveQueries } from "@/hooks/useLiveQueries";
import { useServices } from "@/hooks/useServices";
import { uniqueCategoryName } from "@/lib/board-groups";
import { useAppliedAppearance } from "@/lib/theme";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { DashboardAppearanceSettings } from "@shared/dashboard-settings";

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
    move,
    reload,
  } = useServices();
  const categories = useCategories();
  const {
    error: settingsError,
    scope: settingsScope,
    settings,
    setScope: setSettingsScope,
    updateAppearance,
    updateLayout,
  } = useDashboardSettings();
  // Settings can preview appearance (wallpaper sliders) live before saving it.
  const [appearancePreview, setAppearancePreview] =
    useState<Partial<DashboardAppearanceSettings> | null>(null);
  const appearance = useMemo(
    () => ({ ...settings.appearance, ...appearancePreview }),
    [appearancePreview, settings.appearance]
  );
  useAppliedAppearance(appearance);
  const { density, mode, statsPosition, showServices, showStats } = settings.layout;

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // The category whose name is being edited in place, e.g. one just created.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  // Mounted on first open and kept, so closing still plays the exit animation.
  const [settingsMounted, setSettingsMounted] = useState(false);
  const openSettings = () => {
    setSettingsMounted(true);
    setSettingsOpen(true);
  };

  const startEditing = () => {
    setSearch("");
    setSettingsOpen(false);
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setRenamingKey(null);
  };

  const addCategory = () => {
    categories.create(uniqueCategoryName(categories.categories)).then(
      (category) => setRenamingKey(category.id),
      (createError) => toastError(createError, "Couldn't create the category")
    );
  };

  const stats = showStats ? <StatsStrip /> : null;

  return (
    <div className={cn("flex min-h-svh flex-col", !appearance.wallpaper && "bg-background")}>
      <Wallpaper
        wallpaper={appearance.wallpaper}
        wallpaperBlur={appearance.wallpaperBlur}
        wallpaperDim={appearance.wallpaperDim}
      />
      <AppHeader
        title={appearance.title}
        editing={editing}
        search={search}
        canEditLayout={showServices}
        onAddService={() => setAddOpen(true)}
        onDoneEditing={stopEditing}
        onEditLayout={startEditing}
        onNewCategory={addCategory}
        onOpenSettings={openSettings}
        onSearchChange={setSearch}
      />
      <main className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {statsPosition === "top" && stats}
        {showServices && (
          <ServicesSection
            services={services}
            categories={categories}
            loading={servicesLoading}
            error={servicesError}
            density={density}
            mode={mode}
            search={search}
            editing={editing}
            renamingKey={renamingKey}
            addOpen={addOpen}
            onAddOpenChange={setAddOpen}
            onRenamingKeyChange={setRenamingKey}
            onSearchChange={setSearch}
            onRetry={reload}
            onCreate={create}
            onUpdate={update}
            onDelete={remove}
            onRestore={restore}
            onDuplicate={duplicate}
            onMove={move}
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
            appearance={appearance}
            density={density}
            mode={mode}
            statsPosition={statsPosition}
            settingsError={settingsError}
            settingsScope={settingsScope}
            showServicesSection={showServices}
            showStatsSection={showStats}
            onAppearanceChange={updateAppearance}
            onAppearancePreview={setAppearancePreview}
            onDensityChange={(value) => updateLayout({ density: value })}
            onEditLayout={startEditing}
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
