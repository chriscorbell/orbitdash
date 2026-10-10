import type { SettingsScope } from "@/hooks/useDashboardSettings";
import type {
  BoardMode,
  CardDensity,
  DashboardAppearanceSettings,
  DashboardSearchSettings,
  DashboardWidgetSettings,
  LinkPreference,
  StatsPosition,
} from "@shared/dashboard-settings";

export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "widgets", label: "Widgets" },
  { id: "search", label: "Search" },
  { id: "alerts", label: "Alerts" },
  { id: "notifications", label: "Notifications" },
  { id: "docker", label: "Docker" },
  { id: "data", label: "Data" },
  { id: "security", label: "Security" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Sections stored in the dashboard settings document, which a device can override. */
export const SCOPED_SECTIONS: ReadonlySet<SettingsSectionId> = new Set([
  "general",
  "appearance",
  "layout",
  "widgets",
  "search",
]);

/** "/settings/layout" -> "layout"; anything else (including "/settings") -> null. */
export function settingsSectionFromPath(pathname: string): SettingsSectionId | null {
  const id = pathname.split("/")[2] ?? "";
  return SETTINGS_SECTIONS.some((section) => section.id === id) ? (id as SettingsSectionId) : null;
}

export interface SettingsAccount {
  mode: "password" | "proxy";
  /** The proxy's user name; password mode has a single shared login. */
  user: string | null;
  onSignOut?: () => void;
}

/** Everything the sections read and change; App passes it straight through. */
export interface SettingsProps {
  account?: SettingsAccount;
  appearance: DashboardAppearanceSettings;
  density: CardDensity;
  linkPreference: LinkPreference;
  mode: BoardMode;
  search: DashboardSearchSettings;
  statsPosition: StatsPosition;
  settingsError?: string | null;
  settingsScope: SettingsScope;
  showServicesSection: boolean;
  showStatsSection: boolean;
  showStatsPage: boolean;
  widgets: DashboardWidgetSettings;
  onAppearanceChange: (appearance: Partial<DashboardAppearanceSettings>) => void;
  /** Shows unsaved appearance (wallpaper sliders) on the page while it is adjusted. */
  onAppearancePreview: (appearance: Partial<DashboardAppearanceSettings> | null) => void;
  onDensityChange: (density: CardDensity) => void;
  onEditLayout: () => void;
  onLinkPreferenceChange: (preference: LinkPreference) => void;
  onModeChange: (mode: BoardMode) => void;
  onSearchChange: (search: Partial<DashboardSearchSettings>) => void;
  onStatsPositionChange: (position: StatsPosition) => void;
  onSettingsScopeChange: (scope: SettingsScope) => void;
  onShowServicesSectionChange: (enabled: boolean) => void;
  onShowStatsSectionChange: (enabled: boolean) => void;
  onShowStatsPageChange: (enabled: boolean) => void;
  onWidgetsChange: (widgets: Partial<DashboardWidgetSettings>) => void;
}
