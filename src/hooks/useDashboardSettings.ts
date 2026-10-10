import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchDashboardSettings,
  updateDeviceSettings,
  updateSharedSettings,
} from "@/lib/api/dashboard-settings";
import { getDeviceId } from "@/lib/device-id";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  diffDashboardSettings,
  isEmptySettingsPatch,
  mergeDashboardSettings,
  parseDashboardSettings,
  type DashboardLayoutSettings,
  type DashboardSettings,
  type DashboardSettingsResponse,
} from "@shared/dashboard-settings";

export type SettingsScope = "all" | "device";

const CACHE_KEY = "orbitdash.settingsCache";
const LEGACY_KEYS = {
  gridColumns: "orbitdash.servicesGrid",
  sectionOrder: "orbitdash.sectionOrder",
  servicesFirst: "orbitdash.servicesFirst",
  showServices: "orbitdash.showServicesSection",
  showStats: "orbitdash.showStatsSection",
} as const;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readCachedSettings(): DashboardSettings | null {
  const cached = readStorage(CACHE_KEY);
  if (cached === null) return null;
  try {
    return parseDashboardSettings(JSON.parse(cached));
  } catch {
    return null;
  }
}

function writeCachedSettings(settings: DashboardSettings) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage access issues.
  }
}

/** Layout preferences older versions kept in this browser, or null if there are none. */
export function readLegacyLayout(): DashboardSettings | null {
  const values = Object.fromEntries(
    Object.entries(LEGACY_KEYS).map(([field, key]) => [field, readStorage(key)])
  ) as Record<keyof typeof LEGACY_KEYS, string | null>;
  if (Object.values(values).every((value) => value === null)) {
    return null;
  }

  const layout = { ...DEFAULT_DASHBOARD_SETTINGS.layout };
  if (values.sectionOrder === "stats-first") layout.servicesFirst = false;
  if (values.servicesFirst !== null) layout.servicesFirst = values.servicesFirst !== "false";
  if (values.showServices !== null) layout.showServices = values.showServices !== "false";
  if (values.showStats !== null) layout.showStats = values.showStats !== "false";
  if (values.gridColumns === "3" || values.gridColumns === "5") {
    layout.gridColumns = Number(values.gridColumns) as 3 | 5;
  }
  return { layout };
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
async function importLegacyLayout(
  view: DashboardSettingsResponse,
  deviceId: string
): Promise<DashboardSettingsResponse> {
  const legacy = readLegacyLayout();
  if (!legacy) return view;

  let next = view;
  if (!view.stored) {
    next = await updateSharedSettings(legacy, deviceId);
  } else {
    const differences = diffDashboardSettings(view.settings, legacy);
    if (!isEmptySettingsPatch(differences)) {
      next = await updateDeviceSettings(deviceId, { overrides: differences });
    }
  }
  clearLegacyLayout();
  return next;
}

/** Dashboard settings from the server, shared or per device, with optimistic updates. */
export function useDashboardSettings() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const [settings, setSettings] = useState<DashboardSettings>(
    () => readCachedSettings() ?? readLegacyLayout() ?? DEFAULT_DASHBOARD_SETTINGS
  );
  const [view, setView] = useState<DashboardSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<DashboardSettingsResponse | null>(null);

  const applyView = useCallback((next: DashboardSettingsResponse) => {
    viewRef.current = next;
    setView(next);
    setSettings(next.effective);
    writeCachedSettings(next.effective);
  }, []);

  useEffect(() => {
    let active = true;

    fetchDashboardSettings(deviceId)
      .then((loaded) => importLegacyLayout(loaded, deviceId))
      .then((next) => {
        if (active) applyView(next);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
        }
      });

    return () => {
      active = false;
    };
  }, [applyView, deviceId]);

  const scope: SettingsScope =
    view?.device && !isEmptySettingsPatch(view.device.overrides) ? "device" : "all";

  const runUpdate = useCallback(
    async (optimistic: DashboardSettings, request: () => Promise<DashboardSettingsResponse>) => {
      setSettings(optimistic);
      setError(null);
      try {
        applyView(await request());
      } catch (saveError) {
        setSettings(viewRef.current?.effective ?? optimistic);
        setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
      }
    },
    [applyView]
  );

  const updateLayout = useCallback(
    (patch: Partial<DashboardLayoutSettings>) => {
      const optimistic = mergeDashboardSettings(settings, { layout: patch });
      void runUpdate(optimistic, () =>
        scope === "device"
          ? updateDeviceSettings(deviceId, { overrides: { layout: patch } })
          : updateSharedSettings({ layout: patch }, deviceId)
      );
    },
    [deviceId, runUpdate, scope, settings]
  );

  /** "device" copies the current layout as this device's own; "all" drops the overrides. */
  const setScope = useCallback(
    (next: SettingsScope) => {
      if (next === scope) return;
      const shared = viewRef.current?.settings ?? settings;
      void runUpdate(next === "device" ? settings : shared, () =>
        updateDeviceSettings(deviceId, {
          overrides: next === "device" ? { layout: settings.layout } : null,
        })
      );
    },
    [deviceId, runUpdate, scope, settings]
  );

  return { error, scope, settings, setScope, updateLayout };
}
