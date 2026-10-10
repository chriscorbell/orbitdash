import { Columns3, LayoutGrid, LayoutList, List, PencilRuler, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsChoiceRow, type ChoiceOption } from "@/components/settings/SettingsRows";
import type { SettingsProps } from "@/components/settings/settings-sections";
import { resolveLinkTarget } from "@/lib/link-target";
import type {
  BoardMode,
  CardDensity,
  LinkPreference,
  StatsPosition,
} from "@shared/dashboard-settings";

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

const LINK_PREFERENCE_OPTIONS: readonly ChoiceOption<LinkPreference>[] = [
  { value: "auto", label: "Auto" },
  { value: "internal", label: "Internal" },
  { value: "external", label: "External" },
];

export function LayoutSection(props: SettingsProps) {
  return (
    <>
      <SettingsChoiceRow
        id="board-mode"
        title="Arrangement"
        description="Categories side by side, or stacked in rows"
        options={MODE_OPTIONS}
        value={props.mode}
        onChange={props.onModeChange}
      />
      <SettingsChoiceRow
        id="card-density"
        title="Card style"
        description="How much each service card shows"
        options={DENSITY_OPTIONS}
        value={props.density}
        onChange={props.onDensityChange}
      />
      <SettingsChoiceRow
        id="link-preference"
        title="Service links"
        description={`For services with an external URL. Auto picks ${resolveLinkTarget("auto", window.location.hostname)} on this address.`}
        options={LINK_PREFERENCE_OPTIONS}
        value={props.linkPreference}
        onChange={props.onLinkPreferenceChange}
      />
      <SettingsChoiceRow
        id="stats-position"
        title="Stats position"
        description="Where the live stats strip sits"
        options={STATS_POSITION_OPTIONS}
        value={props.statsPosition}
        onChange={props.onStatsPositionChange}
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
          onClick={props.onEditLayout}
        >
          <PencilRuler />
          Edit layout
        </Button>
      </div>
    </>
  );
}
