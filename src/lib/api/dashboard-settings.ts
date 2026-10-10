import { requestJson } from "@/lib/api/client";
import { dashboardSettingsResponseSchema } from "@/lib/api/schemas";
import type {
  DashboardSettingsPatch,
  DashboardSettingsResponse,
  DeviceUpdate,
} from "@shared/dashboard-settings";

function withDevice(path: string, deviceId: string): string {
  return `${path}?device=${encodeURIComponent(deviceId)}`;
}

export function fetchDashboardSettings(deviceId: string): Promise<DashboardSettingsResponse> {
  return requestJson(
    withDevice("/api/settings", deviceId),
    {},
    "Failed to load settings",
    dashboardSettingsResponseSchema
  );
}

export function updateSharedSettings(
  patch: DashboardSettingsPatch,
  deviceId: string
): Promise<DashboardSettingsResponse> {
  return requestJson(
    withDevice("/api/settings", deviceId),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    "Failed to save settings",
    dashboardSettingsResponseSchema
  );
}

export function updateDeviceSettings(
  deviceId: string,
  update: DeviceUpdate
): Promise<DashboardSettingsResponse> {
  return requestJson(
    `/api/settings/devices/${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
    "Failed to save settings for this device",
    dashboardSettingsResponseSchema
  );
}
