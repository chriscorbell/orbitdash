import { lazy, Suspense, useEffect, useState } from "react";
import { Settings } from "lucide-react";
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
import { BackupSettingsSection } from "@/components/settings/BackupSettingsSection";
import { CategoryOrderSaveStatus } from "@/components/settings/CategoryOrderSaveStatus";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { SettingsScope } from "@/hooks/useDashboardSettings";

// The sortable list pulls in dnd-kit, so it loads on demand. Hovering or
// focusing the settings button starts the download before the dialog opens.
const loadCategoryOrderList = () => import("@/components/services/CategoryOrderList");

const CategoryOrderList = lazy(() =>
  loadCategoryOrderList().then((module) => ({ default: module.CategoryOrderList }))
);

function preloadCategoryOrderList() {
  void loadCategoryOrderList();
}

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

interface HeaderProps {
  categoryOrder: UseCategoryOrderResult;
  columnCount: 3 | 4 | 5;
  servicesFirst: boolean;
  settingsError?: string | null;
  settingsScope: SettingsScope;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onColumnCountChange: (columnCount: 3 | 4 | 5) => void;
  onServicesFirstChange: (enabled: boolean) => void;
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
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-xs font-medium ${checked ? "text-emerald-500" : "text-muted-foreground"}`}
        >
          {checked ? "On" : "Off"}
        </span>
        <Switch
          id={id}
          checked={checked}
          aria-describedby={descriptionId}
          onCheckedChange={onCheckedChange}
        />
      </div>
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

export function Header({
  categoryOrder,
  columnCount,
  servicesFirst,
  settingsError = null,
  settingsScope,
  showServicesSection,
  showStatsSection,
  onColumnCountChange,
  onServicesFirstChange,
  onSettingsScopeChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Each move saves on its own, so closing settings only drops any order that failed to save.
  useEffect(() => {
    if (isSettingsOpen) {
      categoryOrder.beginReorder();
    } else {
      categoryOrder.cancelReorder();
    }
    // Only run when isSettingsOpen toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen]);

  const canReorderCategories = categoryOrder.namedCategories.length >= 2;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/orbitdash.svg" alt="orbitdash" className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight text-foreground">orbitdash</span>
        </div>
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open settings"
            onClick={() => setIsSettingsOpen(true)}
            onFocus={preloadCategoryOrderList}
            onPointerEnter={preloadCategoryOrderList}
          >
            <Settings aria-hidden="true" />
          </Button>
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
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
                      ? "Visibility and layout changes apply only to this browser."
                      : "Visibility and layout changes apply to every browser."}
                  </p>
                  {settingsError && (
                    <p className="text-destructive text-sm font-medium">{settingsError}</p>
                  )}
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
                      title="Stats section"
                      description="Show live system metrics"
                      checked={showStatsSection}
                      onCheckedChange={onShowStatsSectionChange}
                    />
                  </div>
                </section>

                {/* Layout */}
                <section className="space-y-3">
                  <SettingsSectionLabel>Layout</SettingsSectionLabel>
                  <div className="space-y-3">
                    {/* Section order */}
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <div className="space-y-0.5">
                        <Label>Section order</Label>
                        <p className="text-muted-foreground text-sm">
                          {servicesFirst
                            ? "Services appears above stats"
                            : "Stats appears above services"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={servicesFirst ? "outline" : "ghost"}
                          size="sm"
                          className="w-full"
                          onClick={() => onServicesFirstChange(true)}
                          aria-pressed={servicesFirst}
                        >
                          Services → Stats
                        </Button>
                        <Button
                          type="button"
                          variant={!servicesFirst ? "outline" : "ghost"}
                          size="sm"
                          className="w-full"
                          onClick={() => onServicesFirstChange(false)}
                          aria-pressed={!servicesFirst}
                        >
                          Stats → Services
                        </Button>
                      </div>
                    </div>

                    {/* Columns per row */}
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <div className="space-y-0.5">
                        <Label>Columns per row</Label>
                        <p className="text-muted-foreground text-sm">
                          Service cards displayed per row
                        </p>
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
                      fallback={
                        <CategoryOrderListFallback count={categoryOrder.draftOrder.length} />
                      }
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
        </>
      </div>
    </header>
  );
}
