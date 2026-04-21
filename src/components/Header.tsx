import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowUpDown, Columns4, LayoutGrid, ListOrdered, Settings } from "lucide-react";

interface HeaderProps {
  canReorderCategories: boolean;
  columnCount: 4 | 5;
  isCategoryOrderBusy: boolean;
  isReorderMode: boolean;
  servicesFirst: boolean;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onColumnCountChange: (columnCount: 4 | 5) => void;
  onServicesFirstChange: (enabled: boolean) => void;
  onShowServicesSectionChange: (enabled: boolean) => void;
  onShowStatsSectionChange: (enabled: boolean) => void;
  onToggleReorder: () => void;
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
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="space-y-1">
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

export function Header({
  canReorderCategories,
  columnCount,
  isCategoryOrderBusy,
  isReorderMode,
  servicesFirst,
  showServicesSection,
  showStatsSection,
  onColumnCountChange,
  onServicesFirstChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
  onToggleReorder,
}: HeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleToggleReorder = () => {
    onToggleReorder();
    setIsSettingsOpen(false);
  };

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
            <Settings className="h-4 w-4" />
          </Button>
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Adjust dashboard layout and category ordering.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <SettingsToggleRow
                  id="show-services-section"
                  title="Services section"
                  description="Show or hide the saved service links area on the dashboard."
                  checked={showServicesSection}
                  onCheckedChange={onShowServicesSectionChange}
                />
                <SettingsToggleRow
                  id="show-stats-section"
                  title="Stats section"
                  description="Show or hide the live system metrics area on the dashboard."
                  checked={showStatsSection}
                  onCheckedChange={onShowStatsSectionChange}
                />
                <SettingsToggleRow
                  id="services-first"
                  title="Services first"
                  description="Keep the services section above stats. Turn this off to show stats first."
                  checked={servicesFirst}
                  onCheckedChange={onServicesFirstChange}
                />
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="space-y-1">
                    <Label htmlFor="service-column-count">Column count</Label>
                    <p
                      id="service-column-count-description"
                      className="text-muted-foreground text-sm"
                    >
                      Choose how many service cards appear per row.
                    </p>
                  </div>
                  <Select
                    value={String(columnCount)}
                    onValueChange={(value) => onColumnCountChange(value === "5" ? 5 : 4)}
                  >
                    <SelectTrigger
                      id="service-column-count"
                      aria-describedby="service-column-count-description"
                      className="w-full"
                    >
                      <SelectValue aria-label={`${columnCount} columns`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">
                        <div className="flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4" />4 columns
                        </div>
                      </SelectItem>
                      <SelectItem value="5">
                        <div className="flex items-center gap-2">
                          <Columns4 className="h-4 w-4" />5 columns
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {canReorderCategories && (
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ArrowUpDown className="h-4 w-4" />
                        Category order
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {isReorderMode
                          ? "Exit category reorder mode without saving more changes."
                          : "Open category reorder mode to update the saved section order."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleToggleReorder}
                      disabled={isCategoryOrderBusy}
                    >
                      <ListOrdered className="h-4 w-4" />
                      {isReorderMode ? "Cancel" : "Reorder"}
                    </Button>
                  </div>
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
