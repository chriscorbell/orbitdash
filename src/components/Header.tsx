import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
import { SortableCategoryItem } from "@/components/services/SortableCategoryItem";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";

interface HeaderProps {
  categoryOrder: UseCategoryOrderResult;
  columnCount: 3 | 4 | 5;
  servicesFirst: boolean;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onColumnCountChange: (columnCount: 3 | 4 | 5) => void;
  onServicesFirstChange: (enabled: boolean) => void;
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
  showServicesSection,
  showStatsSection,
  onColumnCountChange,
  onServicesFirstChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (isSettingsOpen) {
      categoryOrder.beginReorder();
    } else {
      if (categoryOrder.isDirty) {
        void categoryOrder.saveOrder();
      } else {
        categoryOrder.cancelReorder();
      }
    }
    // Only run when isSettingsOpen toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over) {
      categoryOrder.reorderCategories(String(active.id), String(over.id));
    }
  };

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
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Button>
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Dashboard settings</DialogTitle>
                <DialogDescription className="sr-only">
                  Adjust dashboard visibility, layout, and category ordering preferences.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
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
                    <SettingsSectionLabel>Category order</SettingsSectionLabel>
                    <DndContext
                      collisionDetection={closestCenter}
                      sensors={sensors}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={categoryOrder.draftOrder}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {categoryOrder.draftOrder.map((category, index) => (
                            <SortableCategoryItem
                              key={category}
                              category={category}
                              index={index}
                              total={categoryOrder.draftOrder.length}
                              onMoveUp={() => categoryOrder.moveCategory(category, "up")}
                              onMoveDown={() => categoryOrder.moveCategory(category, "down")}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {categoryOrder.error && (
                      <p className="text-destructive text-sm font-medium">{categoryOrder.error}</p>
                    )}
                  </section>
                )}
              </div>

              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
        </>
      </div>
    </header>
  );
}
