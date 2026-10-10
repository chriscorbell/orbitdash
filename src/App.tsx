import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/header/AppHeader";
import { ServicesSection } from "@/components/ServicesSection";
import type { PaletteActionWithIcon } from "@/components/palette/CommandPalette";
import {
  loadCommandPalette,
  loadSettingsDialog,
  loadStatsPage,
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
import { useAppliedAppearance } from "@/lib/theme";
import { navigate, usePathname } from "@/lib/router";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { OPEN_AUTH_SESSION, type AuthSession } from "@shared/auth";
import type { DashboardAppearanceSettings } from "@shared/dashboard-settings";
import {
  Activity,
  LayoutGrid,
  Monitor,
  Moon,
  PencilRuler,
  Plus,
  Settings,
  Sun,
} from "lucide-react";

const StatsPage = lazy(() => loadStatsPage().then((module) => ({ default: module.StatsPage })));

const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette }))
);

const SettingsDialog = lazy(() =>
  loadSettingsDialog().then((module) => ({ default: module.SettingsDialog }))
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
  const {
    error: settingsError,
    scope: settingsScope,
    settings,
    setScope: setSettingsScope,
    updateAppearance,
    updateLayout,
    updateSearch,
  } = useDashboardSettings();
  // Settings can preview appearance (wallpaper sliders) live before saving it.
  const [appearancePreview, setAppearancePreview] =
    useState<Partial<DashboardAppearanceSettings> | null>(null);
  const appearance = useMemo(
    () => ({ ...settings.appearance, ...appearancePreview }),
    [appearancePreview, settings.appearance]
  );
  useAppliedAppearance(appearance);
  const { density, mode, statsPosition, showServices, showStats, showStatsPage } = settings.layout;
  const pathname = usePathname();
  const page = showStatsPage && pathname === "/stats" ? "stats" : "services";

  // Mounted on first use and kept; the query is what was typed before it opened.
  const [palette, setPalette] = useState({ mounted: false, open: false, query: "" });
  const openPalette = (query = "") => setPalette({ mounted: true, open: true, query });
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingState, setEditing] = useState(false);
  // Edit mode ends by itself if the session does (for example, signed out in another tab).
  const editing = editingState && canEdit;
  // The category whose name is being edited in place, e.g. one just created.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  // Mounted on first open and kept, so closing still plays the exit animation.
  const [settingsMounted, setSettingsMounted] = useState(false);
  const openSettings = () => {
    setSettingsMounted(true);
    setSettingsOpen(true);
  };

  const startEditing = () => {
    setSettingsOpen(false);
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

  // Guests only get navigation; everything that changes the dashboard needs a sign-in.
  const editActions: PaletteActionWithIcon[] = [
    {
      id: "add-service",
      label: "Add service",
      keywords: "new create link app",
      icon: Plus,
      run: () => {
        navigate("/");
        setAddOpen(true);
      },
    },
    ...(showServices
      ? [
          {
            id: "edit-layout",
            label: "Edit layout",
            keywords: "arrange reorder drag categories move",
            icon: PencilRuler,
            run: startEditing,
          },
        ]
      : []),
  ];

  const paletteActions: PaletteActionWithIcon[] = [
    ...(canEdit ? editActions : []),
    ...(showStatsPage
      ? [
          page === "stats"
            ? {
                id: "go-services",
                label: "Go to Services",
                keywords: "home dashboard links",
                icon: LayoutGrid,
                run: () => navigate("/"),
              }
            : {
                id: "go-stats",
                label: "Go to Stats",
                keywords: "metrics charts cpu memory disk network",
                icon: Activity,
                run: () => navigate("/stats"),
              },
        ]
      : []),
    ...(canEdit
      ? [
          {
            id: "open-settings",
            label: "Open settings",
            keywords: "preferences options configure",
            icon: Settings,
            run: openSettings,
          },
          ...(
            [
              ["dark", "Use dark theme", Moon],
              ["light", "Use light theme", Sun],
              ["system", "Use system theme", Monitor],
            ] as const
          )
            .filter(([theme]) => theme !== appearance.theme)
            .map(([theme, label, icon]) => ({
              id: `theme-${theme}`,
              label,
              keywords: "appearance mode color",
              icon,
              run: () => updateAppearance({ theme }),
            })),
        ]
      : []),
  ];

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
      />
      {page === "stats" ? (
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
          {statsPosition === "top" && stats}
          {showServices && (
            <ServicesSection
              services={services}
              categories={categories}
              loading={servicesLoading}
              error={servicesError}
              density={density}
              mode={mode}
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
          {!showServices && !showStats && (
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
      {settingsMounted && canEdit && (
        <Suspense fallback={null}>
          <SettingsDialog
            account={
              auth.mode === "none" ? undefined : { mode: auth.mode, user: auth.user, onSignOut }
            }
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
            search={settings.search}
            onSearchChange={updateSearch}
            onModeChange={(value) => updateLayout({ mode: value })}
            onStatsPositionChange={(position) => updateLayout({ statsPosition: position })}
            onSettingsScopeChange={setSettingsScope}
            onShowServicesSectionChange={(visible) => updateLayout({ showServices: visible })}
            onShowStatsSectionChange={(visible) => updateLayout({ showStats: visible })}
            showStatsPage={showStatsPage}
            onShowStatsPageChange={(visible) => updateLayout({ showStatsPage: visible })}
          />
        </Suspense>
      )}
      {palette.mounted && (
        <Suspense fallback={null}>
          <CommandPalette
            open={palette.open}
            initialQuery={palette.query}
            services={services}
            actions={paletteActions}
            search={settings.search}
            onOpenChange={(open) => setPalette((current) => ({ ...current, open }))}
          />
        </Suspense>
      )}
      <LazyToaster />
    </div>
  );
}

export default App;
