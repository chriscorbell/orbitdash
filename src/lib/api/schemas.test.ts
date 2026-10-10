import { describe, expect, it } from "vitest";
import * as iconLibraryMini from "@/lib/api/icon-library";
import * as importMini from "@/lib/api/imports";
import * as metricMini from "@/lib/api/metric-schemas";
import * as mini from "@/lib/api/schemas";
import * as full from "@shared/schemas";
import { dashboardSettingsResponseSchema as fullSettings } from "@shared/dashboard-settings-schemas";
import * as fullHost from "@shared/host-schemas";
import { authSessionSchema as fullAuthSession } from "@shared/auth-schemas";
import * as fullImport from "@shared/import-schemas";
import * as fullStatus from "@shared/status-schemas";
import * as miniStatus from "@/lib/api/status";

const serviceStatus = {
  id: "svc",
  state: "degraded",
  latencyMs: 2_400,
  statusCode: 200,
  error: null,
  checkedAt: 2,
  changedAt: 1,
};

const statusHistory = {
  id: "svc",
  range: "24h",
  resolutionMs: 1_800_000,
  from: 0,
  to: 1,
  uptime: null,
  buckets: [{ ts: 0, checks: 2, failures: 1, slow: 0, latencyMs: null }],
};

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

const historySeries = { avg: [10.5, null], max: [22, null] };
const metricHistory = {
  range: "24h",
  resolutionMs: 300_000,
  from: 0,
  to: 600_000,
  ts: [0, 300_000],
  series: {
    cpu: historySeries,
    memory: historySeries,
    disk: historySeries,
    load1: historySeries,
    temperature: historySeries,
    netRx: historySeries,
    netTx: historySeries,
    diskRead: historySeries,
    diskWrite: historySeries,
  },
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
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
};

const settings = {
  appearance: {
    accent: "mint",
    theme: "system",
    title: "Homelab",
    wallpaper: "wallpaper-0123456789abcdef.png",
    wallpaperBlur: 4,
    wallpaperDim: 30,
    customCss: "",
  },
  layout: {
    mode: "columns",
    density: "comfortable",
    statsPosition: "bottom",
    showServices: true,
    showStats: false,
    showStatsPage: true,
  },
  search: { engine: "custom", customUrl: "https://searx.example.com/?q=%s" },
};

const authSession = {
  authenticated: true,
  canEdit: true,
  guest: "view",
  mode: "proxy",
  user: "chris@example.com",
};

/** Each pair must agree: the browser's zod/mini schema and the shared full-zod schema. */
const pairs = [
  {
    name: "auth session",
    mini: mini.authSessionSchema,
    full: fullAuthSession,
    valid: authSession,
    invalid: [
      { ...authSession, mode: "basic" },
      { ...authSession, guest: "edit" },
      { ...authSession, user: undefined },
      { ...authSession, canEdit: "yes" },
    ],
  },
  {
    name: "service",
    mini: mini.serviceSchema,
    full: full.serviceSchema,
    valid: service,
    invalid: [
      { ...service, position: "2" },
      { ...service, icon_source_url: undefined },
      { ...service, check_method: "icmp" },
      { ...service, check_interval: "60" },
    ],
  },
  {
    name: "service statuses",
    mini: miniStatus.serviceStatusesResponseSchema,
    full: fullStatus.serviceStatusesResponseSchema,
    valid: { statuses: [serviceStatus] },
    invalid: [
      { statuses: [{ ...serviceStatus, state: "flapping" }] },
      { statuses: [{ ...serviceStatus, changedAt: undefined }] },
      {},
    ],
  },
  {
    name: "status history",
    mini: miniStatus.statusHistorySchema,
    full: fullStatus.statusHistorySchema,
    valid: statusHistory,
    invalid: [
      { ...statusHistory, range: "7d" },
      { ...statusHistory, uptime: undefined },
      { ...statusHistory, buckets: [{ ts: 0, checks: 1, failures: 0, latencyMs: null }] },
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
    name: "icon library",
    mini: iconLibraryMini.iconLibraryResponseSchema,
    full: full.iconLibraryResponseSchema,
    valid: {
      entries: [
        {
          id: "selfhst:plex",
          source: "selfhst",
          slug: "plex",
          name: "Plex",
          url: "https://x/p.svg",
        },
      ],
      updatedAt: 1,
    },
    invalid: [
      { entries: [{ id: "x", source: "nope", slug: "x", name: "x", url: "x" }], updatedAt: 1 },
    ],
  },
  {
    name: "import preview",
    mini: importMini.importPreviewSchema,
    full: fullImport.importPreviewSchema,
    valid: {
      format: "homepage",
      groups: [
        {
          name: "Media",
          services: [
            {
              name: "Jellyfin",
              url: "http://10.0.0.20:8096",
              description: "Movies",
              iconUrl: null,
              duplicate: false,
            },
          ],
        },
      ],
      warnings: [],
    },
    invalid: [
      { format: "heimdall", groups: [], warnings: [] },
      { format: "homer", groups: [{ name: "A", services: [{ name: "x" }] }], warnings: [] },
    ],
  },
  {
    name: "import result",
    mini: importMini.importResultSchema,
    full: fullImport.importResultSchema,
    valid: { created: 2, failed: [{ name: "A", error: "nope" }], iconFailures: 1, snapshot: "s" },
    invalid: [{ created: 2, failed: [], iconFailures: "1", snapshot: null }],
  },
  {
    name: "categories",
    mini: mini.categoriesResponseSchema,
    full: full.categoriesResponseSchema,
    valid: { categories: [{ id: "c", name: "Media", position: 0, created_at: 1, updated_at: 2 }] },
    invalid: [{ categories: [{ id: "c", name: "Media", position: "0" }] }, {}],
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
      device: { id: "device-1", name: null, overrides: { layout: { mode: "rows" } } },
      effective: settings,
      settings,
      stored: true,
    },
    invalid: [{ device: null, effective: settings, settings: { layout: {} }, stored: true }],
  },
  {
    name: "host snapshot",
    mini: metricMini.hostSnapshotSchema,
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
  {
    name: "metric history",
    mini: metricMini.metricHistorySchema,
    full: fullHost.metricHistorySchema,
    valid: metricHistory,
    invalid: [
      { ...metricHistory, range: "2h" },
      { ...metricHistory, ts: undefined },
      { ...metricHistory, series: { ...metricHistory.series, netTx: undefined } },
      { ...metricHistory, series: { ...metricHistory.series, cpu: { avg: ["1"], max: [1] } } },
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

  it("read a service cached before status checks existed as checks off", () => {
    const {
      check_enabled: _enabled,
      check_method: _method,
      check_target: _target,
      check_interval: _interval,
      check_ignore_tls: _ignoreTls,
      ...older
    } = service;
    const expected = {
      ...older,
      check_enabled: false,
      check_method: "http",
      check_target: null,
      check_interval: 60,
      check_ignore_tls: false,
    };
    expect(mini.serviceSchema.parse(older)).toEqual(expected);
    expect(full.serviceSchema.parse(older)).toEqual(expected);
  });

  it("parse success replies and import summaries", () => {
    expect(mini.successResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(mini.successResponseSchema.safeParse({ success: false }).success).toBe(false);
    expect(mini.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })).toEqual(
      full.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })
    );
  });
});
