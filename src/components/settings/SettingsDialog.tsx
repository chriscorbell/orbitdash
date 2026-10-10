import { lazy, Suspense, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { BackupSettingsSection } from "@/components/settings/BackupSettingsSection";
import { CategoryOrderSaveStatus } from "@/components/settings/CategoryOrderSaveStatus";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { SettingsScope } from "@/hooks/useDashboardSettings";
import { loadCategoryOrderList } from "@/components/settings/settings-preload";
import type { DashboardAppearanceSettings, StatsPosition } from "@shared/dashboard-settings";

const CategoryOrderList = lazy(() =>
  loadCategoryOrderList().then((module) => ({ default: module.CategoryOrderList }))
);

// Matches the height of a SortableCategoryItem row so the dialog does not jump.
function CategoryOrderListFallback({ count }: { count: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-11.5 rounded-lg border border-border bg-background" />
      ))}
    </div>
  );
}

interface SettingsDialogProps {
  appearance: DashboardAppearanceSettings;
  categoryOrder: UseCategoryOrderResult;
  columnCount: 3 | 4 | 5;
  open: boolean;
  statsPosition: StatsPosition;
  settingsError?: string | null;
  settingsScope: SettingsScope;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onAppearanceChange: (appearance: Partial<DashboardAppearanceSettings>) => void;
  onColumnCountChange: (columnCount: 3 | 4 | 5) => void;
  onOpenChange: (open: boolean) => void;
  onStatsPositionChange: (position: StatsPosition) => void;
  onSettingsScopeChange: (scope: SettingsScope) => void;
  onShowServicesSectionChange: (enabled: boolean) => void;
  onShowStatsSectionChange: (enabled: boolean) => void;
}

interface SettingsToggleRowProps {
  checked: boolean;
  description: string;
  id: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}

function SettingsToggleRow({
  checked,
  description,
  id,
  title,
  onCheckedChange,
}: SettingsToggleRowProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{title}</Label>
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function ColumnDots({ count }: { count: 3 | 4 | 5 }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-1.5 w-1.5 rounded-sm bg-current" />
      ))}
    </div>
  );
}

function SettingsSectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-muted-foreground text-xs font-medium">{children}</h3>;
}

export function SettingsDialog({
  appearance,
  categoryOrder,
  columnCount,
  open,
  statsPosition,
  settingsError = null,
  settingsScope,
  showServicesSection,
  showStatsSection,
  onAppearanceChange,
  onColumnCountChange,
  onOpenChange,
  onStatsPositionChange,
  onSettingsScopeChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
}: SettingsDialogProps) {
  // Each move saves on its own, so closing settings only drops any order that failed to save.
  useEffect(() => {
    if (open) {
      categoryOrder.beginReorder();
    } else {
      categoryOrder.cancelReorder();
    }
    // Only run when the dialog opens or closes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canReorderCategories = categoryOrder.namedCategories.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dashboard settings</DialogTitle>
          <DialogDescription className="sr-only">
            Adjust dashboard visibility, layout, and category ordering preferences.
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
            </div>
          </section>

          {/* Layout */}
          <section className="space-y-3">
            <SettingsSectionLabel>Layout</SettingsSectionLabel>
            <div className="space-y-3">
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label id="stats-position-label">Stats position</Label>
                  <p className="text-muted-foreground text-sm">Where the live stats strip sits</p>
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby="stats-position-label"
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      ["top", "Above services"],
                      ["bottom", "Below services"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={statsPosition === value}
                      variant={statsPosition === value ? "outline" : "ghost"}
                      size="sm"
                      className="w-full"
                      onClick={() => onStatsPositionChange(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Columns per row */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label>Columns per row</Label>
                  <p className="text-muted-foreground text-sm">Service cards displayed per row</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([3, 4, 5] as const).map((count) => (
                    <Button
                      key={count}
                      type="button"
                      variant={columnCount === count ? "outline" : "ghost"}
                      size="sm"
                      className="flex h-auto flex-col items-center gap-1.5 py-2"
                      onClick={() => onColumnCountChange(count)}
                      aria-pressed={columnCount === count}
                      aria-label={`${count} columns`}
                    >
                      <ColumnDots count={count} />
                      <span>{count}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Category order */}
          {canReorderCategories && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <SettingsSectionLabel>Category order</SettingsSectionLabel>
                <CategoryOrderSaveStatus state={categoryOrder.saveState} />
              </div>
              <Suspense
                fallback={<CategoryOrderListFallback count={categoryOrder.draftOrder.length} />}
              >
                <CategoryOrderList
                  order={categoryOrder.draftOrder}
                  onMove={categoryOrder.moveCategory}
                  onReorder={categoryOrder.reorderCategories}
                />
              </Suspense>
              {categoryOrder.error && (
                <div className="flex items-center justify-between gap-3">
                  <p role="alert" className="text-destructive text-sm font-medium">
                    {categoryOrder.error}
                  </p>
                  {categoryOrder.saveState === "error" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void categoryOrder.saveOrder()}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="space-y-3">
            <SettingsSectionLabel>Data</SettingsSectionLabel>
            <BackupSettingsSection />
          </section>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
