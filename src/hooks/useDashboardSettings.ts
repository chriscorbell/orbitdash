import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDashboardSettings,
  updateDeviceSettings,
  updateSharedSettings,
} from "@/lib/api/dashboard-settings";
import { getDeviceId } from "@/lib/device-id";
import { queryKeys } from "@/lib/query-client";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  diffDashboardSettings,
  isEmptySettingsPatch,
  mergeDashboardSettings,
  mergeSettingsPatches,
  parseDashboardSettings,
  type DashboardAppearanceSettings,
  type DashboardLayoutSettings,
  type DashboardSearchSettings,
  type DashboardSettingsPatch,
  type DashboardSettings,
  type DashboardSettingsResponse,
} from "@shared/dashboard-settings";

export type SettingsScope = "all" | "device";

const CACHE_KEY = "orbitdash.settingsCache";
const LEGACY_KEYS = {
  // Read only so it gets cleared: the fixed column count gave way to layout modes.
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
async function importLegacyLayout(
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

function applyPatchToView(
  view: DashboardSettingsResponse,
  scope: SettingsScope,
  patch: DashboardSettingsPatch
): DashboardSettingsResponse {
  if (scope === "device" && view.device) {
    const overrides = mergeSettingsPatches(view.device.overrides, patch);
    return {
      ...view,
      device: { ...view.device, overrides },
      effective: mergeDashboardSettings(view.settings, overrides),
    };
  }
  const settings = mergeDashboardSettings(view.settings, patch);
  return { ...view, settings, effective: mergeDashboardSettings(settings, view.device?.overrides) };
}

/** Dashboard settings from the server, shared or per device, with optimistic updates. */
export function useDashboardSettings() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.settings(deviceId), [deviceId]);
  const [initialSettings] = useState<DashboardSettings>(
    () => readCachedSettings() ?? readLegacyLayout() ?? DEFAULT_DASHBOARD_SETTINGS
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => importLegacyLayout(await fetchDashboardSettings(deviceId), deviceId),
  });
  const view = query.data ?? null;
  const settings = view?.effective ?? initialSettings;

  useEffect(() => {
    if (view) writeCachedSettings(view.effective);
  }, [view]);

  const scope: SettingsScope =
    view?.device && !isEmptySettingsPatch(view.device.overrides) ? "device" : "all";

  const runUpdate = useCallback(
    async (
      optimistic: (current: DashboardSettingsResponse) => DashboardSettingsResponse,
      request: () => Promise<DashboardSettingsResponse>
    ) => {
      const previous = queryClient.getQueryData<DashboardSettingsResponse>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, optimistic(previous));
      setSaveError(null);
      try {
        queryClient.setQueryData(queryKey, await request());
      } catch (failure) {
        if (previous) queryClient.setQueryData(queryKey, previous);
        setSaveError(failure instanceof Error ? failure.message : "Failed to save settings");
      }
    },
    [queryClient, queryKey]
  );

  const updateSettings = useCallback(
    (patch: DashboardSettingsPatch) => {
      void runUpdate(
        (current) => applyPatchToView(current, scope, patch),
        () =>
          scope === "device"
            ? updateDeviceSettings(deviceId, { overrides: patch })
            : updateSharedSettings(patch, deviceId)
      );
    },
    [deviceId, runUpdate, scope]
  );

  const updateLayout = useCallback(
    (layout: Partial<DashboardLayoutSettings>) => updateSettings({ layout }),
    [updateSettings]
  );

  const updateAppearance = useCallback(
    (appearance: Partial<DashboardAppearanceSettings>) => updateSettings({ appearance }),
    [updateSettings]
  );

  const updateSearch = useCallback(
    (search: Partial<DashboardSearchSettings>) => updateSettings({ search }),
    [updateSettings]
  );

  /** "device" copies the current layout as this device's own; "all" drops the overrides. */
  const setScope = useCallback(
    (next: SettingsScope) => {
      if (next === scope || !view) return;
      const overrides: DashboardSettingsPatch = next === "device" ? { ...view.effective } : {};
      void runUpdate(
        (current) => ({
          ...current,
          device: { id: deviceId, name: current.device?.name ?? null, overrides },
          effective: mergeDashboardSettings(current.settings, overrides),
        }),
        () =>
          updateDeviceSettings(deviceId, {
            overrides: next === "device" ? { ...view.effective } : null,
          })
      );
    },
    [deviceId, runUpdate, scope, view]
  );

  const loadError = query.error ? query.error.message || "Failed to load settings" : null;
  return {
    error: saveError ?? loadError,
    loading: query.isPending,
    scope,
    settings,
    setScope,
    updateAppearance,
    updateLayout,
    updateSearch,
  };
}
