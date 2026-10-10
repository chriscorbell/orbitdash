import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSystemInfo } from "@/lib/api/system";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/header/AppHeader";
import { ServicesSection } from "@/components/ServicesSection";
import type { PaletteContext } from "@/components/palette/palette-actions";
import {
  loadCommandPalette,
  loadSettingsPage,
  loadStatsPage,
  loadWidgets,
  preloadCommandPalette,
} from "@/components/settings/settings-preload";
import { StatsStrip } from "@/components/stats/StatsStrip";
import { Wallpaper } from "@/components/Wallpaper";
import { Button } from "@/components/ui/button";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import { useCategories } from "@/hooks/useCategories";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useLiveQueries } from "@/hooks/useLiveQueries";
import { usePaletteShortcuts } from "@/hooks/usePaletteShortcuts";
import { useServices } from "@/hooks/useServices";
import { uniqueCategoryName } from "@/lib/board-groups";
import { resolveLinkTarget } from "@/lib/link-target";
import { useAppliedAppearance } from "@/lib/theme";
import { navigate, usePathname } from "@/lib/router";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { OPEN_AUTH_SESSION, type AuthSession } from "@shared/auth";
import type { DashboardAppearanceSettings } from "@shared/dashboard-settings";

const StatsPage = lazy(() => loadStatsPage().then((module) => ({ default: module.StatsPage })));

const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette }))
);

// Only editors on hosts with Docker load the discovery banner.
const DiscoveryBanner = lazy(() =>
  import("@/components/discovery/DiscoveryBanner").then((module) => ({
    default: module.DiscoveryBanner,
  }))
);

// Integration figures for cards load after the first paint.
const IntegrationLayer = lazy(() =>
  import("@/components/integrations/IntegrationLayer").then((module) => ({
    default: module.IntegrationLayer,
  }))
);

// Widgets load only once one is turned on.
const WidgetRow = lazy(() => loadWidgets().then((module) => ({ default: module.WidgetRow })));
const HeaderWidgets = lazy(() =>
  loadWidgets().then((module) => ({ default: module.HeaderWidgets }))
);

const SettingsPage = lazy(() =>
  loadSettingsPage().then((module) => ({ default: module.SettingsPage }))
);

interface AppProps {
  /** What this browser may do; without auth everyone can edit. */
  auth?: AuthSession;
  /** Opens the sign-in screen from the read-only (guest) dashboard. */
  onSignIn?: () => void;
  onSignOut?: () => void;
}

function App({ auth = OPEN_AUTH_SESSION, onSignIn, onSignOut }: AppProps) {
  useLiveQueries();
  const { canEdit } = auth;
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
  // Shared with the header and the stats strip; says whether Docker is set up.
  const { data: system } = useQuery({
    queryKey: ["system"],
    queryFn: fetchSystemInfo,
    staleTime: 10 * 60_000,
  });
  const {
    error: settingsError,
    scope: settingsScope,
    settings,
    setScope: setSettingsScope,
    updateAppearance,
    updateLayout,
    updateSearch,
    updateWidgets,
  } = useDashboardSettings();
  // Settings can preview appearance (wallpaper sliders) live before saving it.
  const [appearancePreview, setAppearancePreview] =
    useState<Partial<DashboardAppearanceSettings> | null>(null);
  const appearance = useMemo(
    () => ({ ...settings.appearance, ...appearancePreview }),
    [appearancePreview, settings.appearance]
  );
  useAppliedAppearance(appearance);
  const { density, linkPreference, mode, statsPosition, showServices, showStats, showStatsPage } =
    settings.layout;
  const linkTarget = resolveLinkTarget(linkPreference, window.location.hostname);
  const { widgets } = settings;
  const rowWidgets =
    widgets.placement === "row" && (widgets.clock || widgets.weather || widgets.agenda);
  const headerWidgets = widgets.placement === "header" && (widgets.weather || widgets.agenda);
  const pathname = usePathname();
  // Guests can't change settings, so /settings shows them the dashboard.
  const page =
    canEdit && (pathname === "/settings" || pathname.startsWith("/settings/"))
      ? "settings"
      : showStatsPage && pathname === "/stats"
        ? "stats"
        : "services";
  // The page checks it against its sections, keeping their list out of the first paint.
  const settingsSection = pathname.split("/")[2] || null;

  // Mounted on first use and kept; the query is what was typed before it opened.
  const [palette, setPalette] = useState({ mounted: false, open: false, query: "" });
  const openPalette = (query = "") => setPalette({ mounted: true, open: true, query });
  const [addOpen, setAddOpen] = useState(false);
  const [editingState, setEditing] = useState(false);
  // Edit mode ends by itself if the session does (for example, signed out in another tab).
  const editing = editingState && canEdit;
  // The category whose name is being edited in place, e.g. one just created.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const openSettingsAt = (section: "widgets" | null) =>
    navigate(section ? `/settings/${section}` : "/settings");
  const openSettings = () => openSettingsAt(null);

  const startEditing = () => {
    navigate("/");
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

  usePaletteShortcuts(openPalette, { typeToSearch: !editing });

  // The palette is small; load it once the page is idle so the first keystroke opens it at once.
  useEffect(() => {
    const timer = setTimeout(preloadCommandPalette, 2000);
    return () => clearTimeout(timer);
  }, []);

  const paletteContext: PaletteContext = {
    canEdit,
    page,
    showServices,
    showStatsPage,
    theme: appearance.theme,
    onAddService: () => {
      navigate("/");
      setAddOpen(true);
    },
    onEditLayout: startEditing,
    onNavigate: navigate,
    onOpenSettings: openSettings,
    onThemeChange: (theme) => updateAppearance({ theme }),
  };

  const stats = showStats ? <StatsStrip linkToStats={showStatsPage} /> : null;

  return (
    <div className={cn("flex min-h-svh flex-col", !appearance.wallpaper && "bg-background")}>
      <Wallpaper
        wallpaper={appearance.wallpaper}
        wallpaperBlur={appearance.wallpaperBlur}
        wallpaperDim={appearance.wallpaperDim}
      />
      <AppHeader
        title={appearance.title}
        page={page}
        showStatsPage={showStatsPage}
        editing={editing}
        canEdit={canEdit}
        canEditLayout={showServices}
        onAddService={() => setAddOpen(true)}
        onDoneEditing={stopEditing}
        onEditLayout={startEditing}
        onNewCategory={addCategory}
        onOpenSettings={openSettings}
        onSignIn={auth.mode === "password" ? onSignIn : undefined}
        onOpenPalette={() => openPalette()}
        onPreloadPalette={preloadCommandPalette}
        clockFormat={widgets.clockFormat}
        widgets={
          headerWidgets ? (
            <Suspense fallback={null}>
              <HeaderWidgets widgets={widgets} />
            </Suspense>
          ) : null
        }
      />
      {page === "settings" ? (
        <main
          key="settings"
          className="page-load mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"
        >
          <Suspense
            fallback={
              <div
                role="status"
                className="h-96 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none"
              >
                <span className="sr-only">Loading settings</span>
              </div>
            }
          >
            <SettingsPage
              section={settingsSection}
              account={
                auth.mode === "none" ? undefined : { mode: auth.mode, user: auth.user, onSignOut }
              }
              appearance={appearance}
              density={density}
              linkPreference={linkPreference}
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
              onLinkPreferenceChange={(value) => updateLayout({ linkPreference: value })}
              search={settings.search}
              onSearchChange={updateSearch}
              widgets={widgets}
              onWidgetsChange={updateWidgets}
              onModeChange={(value) => updateLayout({ mode: value })}
              onStatsPositionChange={(position) => updateLayout({ statsPosition: position })}
              onSettingsScopeChange={setSettingsScope}
              onShowServicesSectionChange={(visible) => updateLayout({ showServices: visible })}
              onShowStatsSectionChange={(visible) => updateLayout({ showStats: visible })}
              showStatsPage={showStatsPage}
              onShowStatsPageChange={(visible) => updateLayout({ showStatsPage: visible })}
            />
          </Suspense>
        </main>
      ) : page === "stats" ? (
        <main key="stats" className="page-load mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Suspense
            fallback={
              <div
                role="status"
                className="h-96 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none"
              >
                <span className="sr-only">Loading stats</span>
              </div>
            }
          >
            <StatsPage themeKey={`${appearance.theme}-${appearance.accent}`} />
          </Suspense>
        </main>
      ) : (
        <main
          key="services"
          className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6"
        >
          {rowWidgets && (
            <Suspense fallback={null}>
              <WidgetRow widgets={widgets} onOpenSettings={() => openSettingsAt("widgets")} />
            </Suspense>
          )}
          {statsPosition === "top" && stats}
          {showServices && canEdit && system?.docker && (
            <Suspense fallback={null}>
              <DiscoveryBanner
                categories={categories.categories.map((category) => category.name)}
                onCreate={create}
              />
            </Suspense>
          )}
          {showServices && (
            <ServicesSection
              services={services}
              categories={categories}
              loading={servicesLoading}
              error={servicesError}
              density={density}
              mode={mode}
              linkTarget={linkTarget}
              editing={editing}
              readOnly={!canEdit}
              renamingKey={renamingKey}
              addOpen={addOpen}
              onAddOpenChange={setAddOpen}
              onRenamingKeyChange={setRenamingKey}
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
          {!showServices && !showStats && !rowWidgets && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <p className="text-sm font-medium">Nothing is shown right now</p>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={openSettings}>
                  Open settings
                </Button>
              )}
            </div>
          )}
        </main>
      )}
      <Footer />
      {palette.mounted && (
        <Suspense fallback={null}>
          <CommandPalette
            open={palette.open}
            initialQuery={palette.query}
            services={services}
            linkTarget={linkTarget}
            context={paletteContext}
            search={settings.search}
            onOpenChange={(open) => setPalette((current) => ({ ...current, open }))}
          />
        </Suspense>
      )}
      {services.length > 0 && (
        <Suspense fallback={null}>
          <IntegrationLayer />
        </Suspense>
      )}
      <LazyToaster />
    </div>
  );
}

export default App;
