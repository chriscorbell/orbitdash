import { DashboardTitleField } from "@/components/settings/DashboardTitleField";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
import type { SettingsProps } from "@/components/settings/settings-sections";

export function GeneralSection(props: SettingsProps) {
  return (
    <>
      <DashboardTitleField
        title={props.appearance.title}
        onChange={(title) => props.onAppearanceChange({ title })}
      />
      <SettingsToggleRow
        id="show-services-section"
        title="Services section"
        description="Show saved service links"
        checked={props.showServicesSection}
        onCheckedChange={props.onShowServicesSectionChange}
      />
      <SettingsToggleRow
        id="show-stats-section"
        title="Live stats"
        description="Show CPU, memory and disk usage"
        checked={props.showStatsSection}
        onCheckedChange={props.onShowStatsSectionChange}
      />
      <SettingsToggleRow
        id="show-stats-page"
        title="Stats page"
        description="Show the Stats tab with charts and history"
        checked={props.showStatsPage}
        onCheckedChange={props.onShowStatsPageChange}
      />
    </>
  );
}
