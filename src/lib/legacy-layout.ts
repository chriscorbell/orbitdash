import { updateDeviceSettings, updateSharedSettings } from "@/lib/api/dashboard-settings";
import { LEGACY_KEYS, readStorage } from "@/hooks/useDashboardSettings";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  diffDashboardSettings,
  isEmptySettingsPatch,
  type DashboardSettings,
  type DashboardSettingsResponse,
} from "@shared/dashboard-settings";

/** Layout preferences older versions kept in this browser, or null if there are none. */
export function readLegacyLayout(): DashboardSettings | null {
  const values = Object.fromEntries(
    Object.entries(LEGACY_KEYS).map(([field, key]) => [field, readStorage(key)])
  ) as Record<keyof typeof LEGACY_KEYS, string | null>;
  if (Object.values(values).every((value) => value === null)) {
    return null;
  }

  const layout = { ...DEFAULT_DASHBOARD_SETTINGS.layout };
  // Older versions stored "services first"; keeping the user's order means stats go below.
  if (values.sectionOrder === "services-first") layout.statsPosition = "bottom";
  if (values.servicesFirst !== null) {
    layout.statsPosition = values.servicesFirst === "false" ? "top" : "bottom";
  }
  if (values.showServices !== null) layout.showServices = values.showServices !== "false";
  if (values.showStats !== null) layout.showStats = values.showStats !== "false";
  return { ...DEFAULT_DASHBOARD_SETTINGS, layout };
}

function clearLegacyLayout() {
  try {
    for (const key of Object.values(LEGACY_KEYS)) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access issues.
  }
}

/**
 * Brings this browser's pre-0.3 layout to the server once: it becomes the shared settings when
 * none exist yet, otherwise any differences become this device's own overrides.
 */
export async function importLegacyLayout(
  view: DashboardSettingsResponse,
  deviceId: string
): Promise<DashboardSettingsResponse> {
  const legacy = readLegacyLayout();
  if (!legacy) return view;

  let next = view;
  try {
    if (!view.stored) {
      next = await updateSharedSettings(legacy, deviceId);
    } else {
      const differences = diffDashboardSettings(view.settings, legacy);
      if (!isEmptySettingsPatch(differences)) {
        next = await updateDeviceSettings(deviceId, { overrides: differences });
      }
    }
  } catch {
    // A guest can't save settings. Show the server's and keep the old layout for a later visit.
    return view;
  }
  clearLegacyLayout();
  return next;
}
