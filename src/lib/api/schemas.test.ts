import { describe, expect, it } from "vitest";
import * as mini from "@/lib/api/schemas";
import * as full from "@shared/schemas";
import { dashboardSettingsResponseSchema as fullSettings } from "@shared/dashboard-settings-schemas";
import * as fullHost from "@shared/host-schemas";

const hostSnapshot = {
  version: 1,
  ts: 1,
  intervalMs: 1000,
  cpu: {
    usage: 12.5,
    cores: [{ id: 0, usage: null, frequencyMhz: 3400 }],
    load: { one: 0.5, five: 0.4, fifteen: 0.3 },
    frequencyMhz: 3400,
    temperatureCelsius: null,
  },
  memory: {
    totalBytes: 16,
    usedBytes: 6,
    availableBytes: 10,
    cachedBytes: null,
    swapTotalBytes: 4,
    swapUsedBytes: 1,
  },
  temperatures: [{ id: "hwmon2/temp1", chip: "coretemp", label: null, celsius: 52 }],
  filesystems: [
    {
      mountpoint: "/",
      device: "/dev/sda1",
      type: "ext4",
      totalBytes: 10,
      usedBytes: 4,
      availableBytes: 6,
    },
  ],
  disks: [{ name: "sda", readBytesPerSec: null, writeBytesPerSec: 512 }],
  network: [{ name: "eth0", rxBytesPerSec: 100, txBytesPerSec: null }],
};

const systemInfo = {
  cpuCount: 4,
  cpuModel: null,
  hostname: "nas",
  kernel: "6.8.0",
  osName: "Debian GNU/Linux 12 (bookworm)",
  platform: "linux",
  uptimeSeconds: 60,
};

const service = {
  id: "svc",
  name: "Jellyfin",
  url: "http://10.0.0.20:8096/",
  description: null,
  icon: "svc.svg",
  icon_source_url: "https://cdn.example/jellyfin.svg",
  category: "Media",
  category_id: "cat",
  position: 2,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 2,
};

const settings = {
  appearance: { accent: "mint", theme: "system" },
  layout: { gridColumns: 4, statsPosition: "bottom", showServices: true, showStats: false },
};

/** Each pair must agree: the browser's zod/mini schema and the shared full-zod schema. */
const pairs = [
  {
    name: "service",
    mini: mini.serviceSchema,
    full: full.serviceSchema,
    valid: service,
    invalid: [
      { ...service, position: "2" },
      { ...service, icon_source_url: undefined },
    ],
  },
  {
    name: "metrics",
    mini: mini.metricsResponseSchema,
    full: full.metricsResponseSchema,
    valid: { samples: [{ ts: 1, cpu: 2, ram: 3, disk: 4 }] },
    invalid: [{ samples: [{ ts: 1, cpu: 2, ram: 3 }] }],
  },
  {
    name: "rename",
    mini: mini.renameCategoryResponseSchema,
    full: full.renameCategoryResponseSchema,
    valid: { services: [service], order: ["Media"] },
    invalid: [{ services: [service] }],
  },
  {
    name: "snapshots",
    mini: mini.snapshotsResponseSchema,
    full: full.snapshotsResponseSchema,
    valid: { snapshots: [{ createdAt: "x", name: "n", reason: "nightly", sizeBytes: 1 }] },
    invalid: [{ snapshots: [{ createdAt: "x", name: "n", reason: "weekly", sizeBytes: 1 }] }],
  },
  {
    name: "settings",
    mini: mini.dashboardSettingsResponseSchema,
    full: fullSettings,
    valid: {
      device: { id: "device-1", name: null, overrides: { layout: { gridColumns: 3 } } },
      effective: settings,
      settings,
      stored: true,
    },
    invalid: [{ device: null, effective: settings, settings: { layout: {} }, stored: true }],
  },
  {
    name: "host snapshot",
    mini: mini.hostSnapshotSchema,
    full: fullHost.hostSnapshotSchema,
    valid: hostSnapshot,
    invalid: [
      { ...hostSnapshot, version: 2 },
      { ...hostSnapshot, memory: undefined },
      { ...hostSnapshot, cpu: { ...hostSnapshot.cpu, load: { one: 1 } } },
      { ...hostSnapshot, disks: [{ name: "sda", readBytesPerSec: "1" }] },
    ],
  },
  {
    name: "system info",
    mini: mini.systemInfoSchema,
    full: fullHost.systemInfoSchema,
    valid: systemInfo,
    invalid: [
      { ...systemInfo, osName: undefined },
      { ...systemInfo, uptimeSeconds: "60" },
    ],
  },
];

describe("browser response schemas", () => {
  for (const pair of pairs) {
    it(`agree with the shared ${pair.name} schema`, () => {
      expect(pair.mini.parse(pair.valid)).toEqual(pair.full.parse(pair.valid));
      for (const value of pair.invalid) {
        expect(pair.mini.safeParse(value).success).toBe(false);
        expect(pair.full.safeParse(value).success).toBe(false);
      }
    });
  }

  it("parse category orders and import summaries", () => {
    expect(mini.categoryOrderResponseSchema.parse({ order: ["a"] })).toEqual({ order: ["a"] });
    expect(mini.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })).toEqual(
      full.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })
    );
  });
});
