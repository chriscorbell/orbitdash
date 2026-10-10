import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertSettings } from "@/components/settings/AlertSettings";
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { CustomCssSettings } from "@/components/settings/CustomCssSettings";
import { DashboardTitleField } from "@/components/settings/DashboardTitleField";
import { WallpaperSettings } from "@/components/settings/WallpaperSettings";
import { WebSearchSettings } from "@/components/settings/WebSearchSettings";
import { BackupSettingsSection } from "@/components/settings/BackupSettingsSection";
import {
  SettingsChoiceRow,
  SettingsSectionLabel,
  SettingsToggleRow,
  type ChoiceOption,
} from "@/components/settings/SettingsRows";
import { DashboardImportSettings } from "@/components/settings/DashboardImportSettings";
import type { SettingsScope } from "@/hooks/useDashboardSettings";
import type {
  BoardMode,
  CardDensity,
  DashboardAppearanceSettings,
  DashboardSearchSettings,
  DashboardWidgetSettings,
  StatsPosition,
} from "@shared/dashboard-settings";
import { Columns3, LayoutGrid, LayoutList, List, PencilRuler, Rows3 } from "lucide-react";

// Its own chunk, fetched as the dialog opens; the section sits below the fold.
const WidgetSettings = lazy(() =>
  import("@/components/settings/WidgetSettings").then((module) => ({
    default: module.WidgetSettings,
  }))
);

interface SettingsDialogProps {
  /** A section to scroll into view when the dialog opens. */
  focusSection?: "widgets" | null;
  widgets: DashboardWidgetSettings;
  onWidgetsChange: (widgets: Partial<DashboardWidgetSettings>) => void;
  appearance: DashboardAppearanceSettings;
  density: CardDensity;
  mode: BoardMode;
  open: boolean;
  search: DashboardSearchSettings;
  statsPosition: StatsPosition;
  settingsError?: string | null;
  settingsScope: SettingsScope;
  showServicesSection: boolean;
  showStatsSection: boolean;
  showStatsPage: boolean;
  onAppearanceChange: (appearance: Partial<DashboardAppearanceSettings>) => void;
  /** Shows unsaved appearance (wallpaper sliders) on the page while it is adjusted. */
  onAppearancePreview: (appearance: Partial<DashboardAppearanceSettings> | null) => void;
  onDensityChange: (density: CardDensity) => void;
  onEditLayout: () => void;
  onModeChange: (mode: BoardMode) => void;
  onSearchChange: (search: Partial<DashboardSearchSettings>) => void;
  onOpenChange: (open: boolean) => void;
  onStatsPositionChange: (position: StatsPosition) => void;
  onSettingsScopeChange: (scope: SettingsScope) => void;
  onShowServicesSectionChange: (enabled: boolean) => void;
  onShowStatsSectionChange: (enabled: boolean) => void;
  onShowStatsPageChange: (enabled: boolean) => void;
}

const MODE_OPTIONS: readonly ChoiceOption<BoardMode>[] = [
  { value: "columns", label: "Columns", icon: Columns3 },
  { value: "rows", label: "Rows", icon: Rows3 },
];

const DENSITY_OPTIONS: readonly ChoiceOption<CardDensity>[] = [
  { value: "compact", label: "Compact", icon: List },
  { value: "comfortable", label: "Cards", icon: LayoutList },
  { value: "tiles", label: "Tiles", icon: LayoutGrid },
];

const STATS_POSITION_OPTIONS: readonly ChoiceOption<StatsPosition>[] = [
  { value: "top", label: "Above services" },
  { value: "bottom", label: "Below services" },
];

export function SettingsDialog({
  focusSection = null,
  widgets,
  onWidgetsChange,
  appearance,
  density,
  mode,
  open,
  search,
  statsPosition,
  settingsError = null,
  settingsScope,
  showServicesSection,
  showStatsSection,
  showStatsPage,
  onAppearanceChange,
  onAppearancePreview,
  onDensityChange,
  onEditLayout,
  onModeChange,
  onSearchChange,
  onOpenChange,
  onStatsPositionChange,
  onSettingsScopeChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
  onShowStatsPageChange,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dashboard settings</DialogTitle>
          <DialogDescription className="sr-only">
            Adjust dashboard appearance, visibility and layout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-2" aria-labelledby="settings-scope-label">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["all", "All devices"],
                  ["device", "This device"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={settingsScope === value ? "outline" : "ghost"}
                  size="sm"
                  aria-pressed={settingsScope === value}
                  onClick={() => onSettingsScopeChange(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p id="settings-scope-label" className="text-muted-foreground text-xs">
              {settingsScope === "device"
                ? "Appearance and layout changes apply only to this browser."
                : "Appearance and layout changes apply to every browser."}
            </p>
            {settingsError && (
              <p className="text-destructive text-sm font-medium">{settingsError}</p>
            )}
          </section>

          <section className="space-y-3">
            <SettingsSectionLabel>Appearance</SettingsSectionLabel>
            <AppearanceSettingsSection appearance={appearance} onChange={onAppearanceChange} />
            <DashboardTitleField
              title={appearance.title}
              onChange={(title) => onAppearanceChange({ title })}
            />
            <WallpaperSettings
              appearance={appearance}
              onChange={onAppearanceChange}
              onPreview={onAppearancePreview}
            />
          </section>

          {/* Visibility */}
          <section className="space-y-3">
            <SettingsSectionLabel>Visibility</SettingsSectionLabel>
            <div className="space-y-2">
              <SettingsToggleRow
                id="show-services-section"
                title="Services section"
                description="Show saved service links"
                checked={showServicesSection}
                onCheckedChange={onShowServicesSectionChange}
              />
              <SettingsToggleRow
                id="show-stats-section"
                title="Live stats"
                description="Show CPU, memory and disk usage"
                checked={showStatsSection}
                onCheckedChange={onShowStatsSectionChange}
              />
              <SettingsToggleRow
                id="show-stats-page"
                title="Stats page"
                description="Show the Stats tab with charts and history"
                checked={showStatsPage}
                onCheckedChange={onShowStatsPageChange}
              />
            </div>
          </section>

          {/* Layout */}
          <section className="space-y-3">
            <SettingsSectionLabel>Layout</SettingsSectionLabel>
            <div className="space-y-3">
              <SettingsChoiceRow
                id="board-mode"
                title="Arrangement"
                description="Categories side by side, or stacked in rows"
                options={MODE_OPTIONS}
                value={mode}
                onChange={onModeChange}
              />
              <SettingsChoiceRow
                id="card-density"
                title="Card style"
                description="How much each service card shows"
                options={DENSITY_OPTIONS}
                value={density}
                onChange={onDensityChange}
              />
              <SettingsChoiceRow
                id="stats-position"
                title="Stats position"
                description="Where the live stats strip sits"
                options={STATS_POSITION_OPTIONS}
                value={statsPosition}
                onChange={onStatsPositionChange}
              />
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Categories and order</p>
                  <p className="text-muted-foreground text-sm">
                    Drag, rename and add categories on the dashboard
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={onEditLayout}
                >
                  <PencilRuler />
                  Edit layout
                </Button>
              </div>
            </div>
          </section>

          <section
            id="settings-widgets"
            className="scroll-mt-4 space-y-3"
            ref={(node) => {
              if (node && open && focusSection === "widgets") {
                node.scrollIntoView({ block: "start" });
              }
            }}
          >
            <SettingsSectionLabel>Widgets</SettingsSectionLabel>
            <Suspense
              fallback={
                <div className="h-24 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
              }
            >
              <WidgetSettings widgets={widgets} onChange={onWidgetsChange} />
            </Suspense>
          </section>

          <section className="space-y-3">
            <SettingsSectionLabel>Alerts</SettingsSectionLabel>
            <AlertSettings />
          </section>

          <section className="space-y-3">
            <SettingsSectionLabel>Search</SettingsSectionLabel>
            <WebSearchSettings search={search} onChange={onSearchChange} />
          </section>

          <section className="space-y-3">
            <SettingsSectionLabel>Advanced</SettingsSectionLabel>
            <CustomCssSettings
              customCss={appearance.customCss}
              onChange={(customCss) => onAppearanceChange({ customCss })}
            />
          </section>

          <section className="space-y-3">
            <SettingsSectionLabel>Data</SettingsSectionLabel>
            <DashboardImportSettings />
            <BackupSettingsSection />
          </section>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
