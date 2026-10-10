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
import type { SettingsScope } from "@/hooks/useDashboardSettings";
import type {
  BoardMode,
  CardDensity,
  DashboardAppearanceSettings,
  StatsPosition,
} from "@shared/dashboard-settings";
import {
  Columns3,
  LayoutGrid,
  LayoutList,
  List,
  PencilRuler,
  Rows3,
  type LucideIcon,
} from "lucide-react";

interface SettingsDialogProps {
  appearance: DashboardAppearanceSettings;
  density: CardDensity;
  mode: BoardMode;
  open: boolean;
  statsPosition: StatsPosition;
  settingsError?: string | null;
  settingsScope: SettingsScope;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onAppearanceChange: (appearance: Partial<DashboardAppearanceSettings>) => void;
  onDensityChange: (density: CardDensity) => void;
  onEditLayout: () => void;
  onModeChange: (mode: BoardMode) => void;
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

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SettingsChoiceRowProps<T extends string> {
  description: string;
  id: string;
  options: readonly ChoiceOption<T>[];
  title: string;
  value: T;
  onChange: (value: T) => void;
}

/** A labelled radio group of segmented buttons; arrow keys move the choice like native radios. */
function SettingsChoiceRow<T extends string>({
  description,
  id,
  options,
  title,
  value,
  onChange,
}: SettingsChoiceRowProps<T>) {
  const labelId = `${id}-label`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const next = (current + step + options.length) % options.length;
    onChange(options[next].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label id={labelId}>{title}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid auto-cols-fr grid-flow-col gap-2"
        onKeyDown={handleKeyDown}
      >
        {options.map((option) => {
          const checked = option.value === value;
          const Icon = option.icon;
          return (
            <Button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              variant={checked ? "outline" : "ghost"}
              size="sm"
              className="w-full"
              onClick={() => onChange(option.value)}
            >
              {Icon && <Icon aria-hidden="true" />}
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
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

function SettingsSectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-muted-foreground text-xs font-medium">{children}</h3>;
}

export function SettingsDialog({
  appearance,
  density,
  mode,
  open,
  statsPosition,
  settingsError = null,
  settingsScope,
  showServicesSection,
  showStatsSection,
  onAppearanceChange,
  onDensityChange,
  onEditLayout,
  onModeChange,
  onOpenChange,
  onStatsPositionChange,
  onSettingsScopeChange,
  onShowServicesSectionChange,
  onShowStatsSectionChange,
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
