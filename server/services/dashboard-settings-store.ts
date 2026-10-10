import {
  isEmptySettingsPatch,
  mergeDashboardSettings,
  parseDashboardSettings,
  parseDashboardSettingsPatch,
  type DashboardSettings,
  type DashboardSettingsPatch,
  type DashboardSettingsResponse,
  type DeviceSettings,
  type DeviceUpdate,
} from "@shared/dashboard-settings";
import { getDb } from "../db";

const SETTINGS_KEY = "dashboard.settings";
const DEVICE_KEY_PREFIX = "dashboard.device.";

interface StoredDevice {
  name: string | null;
  overrides: DashboardSettingsPatch;
}

function readValue(key: string): unknown {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as {
    value: string;
  } | null;
  if (!row) return undefined;

  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value));
}

export function readGlobalSettings(): { settings: DashboardSettings; stored: boolean } {
  const raw = readValue(SETTINGS_KEY);
  return { settings: parseDashboardSettings(raw), stored: raw !== undefined };
}

export function updateGlobalSettings(patch: DashboardSettingsPatch): DashboardSettings {
  const next = mergeDashboardSettings(readGlobalSettings().settings, patch);
  writeValue(SETTINGS_KEY, next);
  return next;
}

function readDevice(id: string): DeviceSettings | null {
  const raw = readValue(`${DEVICE_KEY_PREFIX}${id}`) as Partial<StoredDevice> | undefined | null;
  if (!raw || typeof raw !== "object") return null;

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    overrides: parseDashboardSettingsPatch(raw.overrides),
  };
}

export function updateDevice(id: string, update: DeviceUpdate): DeviceSettings {
  const current = readDevice(id) ?? { id, name: null, overrides: {} };
  const name = update.name === undefined ? current.name : update.name?.trim() || null;
  const overrides =
    update.overrides === undefined
      ? current.overrides
      : update.overrides === null
        ? {}
        : { layout: { ...current.overrides.layout, ...update.overrides.layout } };

  const stored: StoredDevice = {
    name,
    overrides: isEmptySettingsPatch(overrides) ? {} : overrides,
  };
  writeValue(`${DEVICE_KEY_PREFIX}${id}`, stored);
  return { id, ...stored };
}

export function deleteDevice(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run(`${DEVICE_KEY_PREFIX}${id}`);
  return result.changes > 0;
}

export function listDevices(): DeviceSettings[] {
  const rows = getDb()
    .prepare("SELECT key FROM settings WHERE key LIKE ? ORDER BY key")
    .all(`${DEVICE_KEY_PREFIX}%`) as Array<{ key: string }>;
  return rows
    .map((row) => readDevice(row.key.slice(DEVICE_KEY_PREFIX.length)))
    .filter((device): device is DeviceSettings => device !== null);
}

/** Shared settings, this device's overrides, and the two merged. */
export function getSettingsView(deviceId: string | null): DashboardSettingsResponse {
  const { settings, stored } = readGlobalSettings();
  const device = deviceId ? readDevice(deviceId) : null;
  return {
    device,
    effective: mergeDashboardSettings(settings, device?.overrides),
    settings,
    stored,
  };
}
