import { describe, expect, it } from "vitest";
import * as iconLibraryMini from "@/lib/api/icon-library";
import * as importMini from "@/lib/api/imports";
import * as metricMini from "@/lib/api/metric-schemas";
import * as mini from "@/lib/api/schemas";
import { bulkDeleteResponseSchema as miniBulkDelete } from "@/lib/api/service-bulk";
import * as full from "@shared/schemas";
import { dashboardSettingsResponseSchema as fullSettings } from "@shared/dashboard-settings-schemas";
import { DEFAULT_DASHBOARD_SETTINGS } from "@shared/dashboard-settings";
import * as fullHost from "@shared/host-schemas";
import { authSessionSchema as fullAuthSession } from "@shared/auth-schemas";
import * as fullImport from "@shared/import-schemas";
import * as fullWidgets from "@shared/widget-schemas";
import * as fullTools from "@shared/service-tools-schemas";
import * as miniTools from "@/lib/api/service-tools";
import * as miniWidgets from "@/lib/api/widgets";
import * as fullStatus from "@shared/status-schemas";
import * as miniStatus from "@/lib/api/status";
import * as miniDocker from "@/lib/api/docker";
import * as miniDiscovery from "@/lib/api/discovery";
import * as miniIntegrations from "@/lib/api/integrations";
import * as fullIntegrations from "@shared/integration-schemas";

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
  docker: false,
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
  external_url: "https://jellyfin.example.com/",
  links: [{ label: "Admin", url: "http://10.0.0.20:8096/web/#/dashboard" }],
  tags: ["media"],
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
    linkPreference: "external",
  },
  search: { engine: "custom", customUrl: "https://searx.example.com/?q=%s" },
  widgets: {
    placement: "row",
    clock: true,
    greeting: false,
    clockFormat: "24h",
    weather: true,
    weatherLocation: { name: "Portland", latitude: 45.5, longitude: -122.7 },
    weatherUnits: "imperial",
    agenda: false,
    agendaDays: 3,
  },
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
      { ...service, external_url: 5 },
      { ...service, links: [{ label: "Admin" }] },
      { ...service, tags: "media" },
    ],
  },
  {
    name: "bulk delete reply",
    mini: miniBulkDelete,
    full: full.bulkDeleteServicesResponseSchema,
    valid: { success: true, deleted: 3, restorableUntil: 1_800_000 },
    invalid: [
      { success: false, deleted: 3, restorableUntil: 1 },
      { success: true, deleted: "3", restorableUntil: 1 },
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
    name: "integration types",
    mini: miniIntegrations.integrationTypesSchema,
    full: fullIntegrations.integrationTypesSchema,
    valid: {
      types: [
        {
          id: "pihole",
          name: "Pi-hole",
          icon: "pi-hole",
          fields: [
            { key: "url", label: "API address", kind: "url", required: false, help: "x" },
            { key: "password", label: "Password", kind: "secret", required: true },
          ],
        },
      ],
    },
    invalid: [{ types: [{ id: "x", name: "x", icon: "x", fields: [{ key: "a", kind: "date" }] }] }],
  },
  {
    name: "service integration",
    mini: miniIntegrations.serviceIntegrationSchema,
    full: fullIntegrations.serviceIntegrationSchema,
    valid: {
      integration: {
        type: "adguard",
        values: { username: "me", ignoreTls: true },
        secretsSet: ["password"],
      },
    },
    invalid: [
      { integration: { type: "adguard", values: { username: 3 }, secretsSet: [] } },
      { integration: { type: "adguard", values: [], secretsSet: [] } },
      { integration: { values: {}, secretsSet: [] } },
      "nope",
    ],
  },
  {
    name: "integration readings",
    mini: miniIntegrations.integrationReadingsSchema,
    full: fullIntegrations.integrationReadingsSchema,
    valid: {
      readings: {
        a: {
          type: "sonarr",
          stats: [{ label: "Queue", value: "3", tone: "good" }],
          error: null,
          updatedAt: 1,
        },
        b: { type: "plex", stats: [], error: "It refused the credentials", updatedAt: 2 },
      },
    },
    invalid: [{ readings: { a: { type: "x", stats: [], error: null } } }, { readings: null }, null],
  },
  {
    name: "docker snapshot",
    mini: miniDocker.dockerSnapshotSchema,
    full: fullHost.dockerSnapshotSchema,
    valid: {
      configured: true,
      available: true,
      error: null,
      containers: [
        {
          id: "abc",
          name: "web",
          image: "nginx",
          state: "exited",
          status: "Exited (0) 1 hour ago",
          health: "unhealthy",
          createdAt: 1,
          ports: [{ privatePort: 53, publicPort: 53, protocol: "udp" }],
          composeProject: "media",
          cpuPercent: null,
          memoryBytes: null,
          memoryLimitBytes: null,
        },
      ],
      updatedAt: null,
    },
    invalid: [{ configured: true, available: "yes", error: null, containers: [], updatedAt: null }],
  },
  {
    name: "discovery",
    mini: miniDiscovery.discoveryResponseSchema,
    full: fullHost.discoveryResponseSchema,
    valid: {
      suggestions: [
        {
          key: "web",
          name: "Web",
          url: "http://web.lan/",
          port: null,
          iconUrl: "https://cdn/x.svg",
          category: "Infra",
          description: "Front door",
          source: "labels",
        },
      ],
      dismissed: 2,
    },
    invalid: [{ suggestions: [], dismissed: "2" }],
  },
  {
    name: "service inspection",
    mini: miniTools.serviceInspectionSchema,
    full: fullTools.serviceInspectionSchema,
    valid: {
      url: "http://nas.lan/",
      reachable: false,
      error: "Connection refused",
      name: null,
      iconUrl: "http://nas.lan/favicon.ico",
      selfSigned: true,
    },
    invalid: [
      { url: "x", reachable: "yes", error: null, name: null, iconUrl: null, selfSigned: false },
    ],
  },
  {
    name: "service test result",
    mini: miniTools.serviceTestResultSchema,
    full: fullTools.serviceTestResultSchema,
    valid: {
      target: "http://x/",
      state: "degraded",
      latencyMs: 2400,
      statusCode: 200,
      error: null,
    },
    invalid: [{ target: "x", state: "unknown", latencyMs: null, statusCode: null, error: null }],
  },
  {
    name: "weather report",
    mini: miniWidgets.weatherReportSchema,
    full: fullWidgets.weatherReportSchema,
    valid: {
      timezone: "UTC",
      current: {
        temperature: 1,
        apparentTemperature: 0,
        weatherCode: 3,
        isDay: true,
        windSpeed: 2,
        humidity: 50,
      },
      daily: [{ date: "2026-10-10", weatherCode: 3, max: 2, min: 0, precipitationChance: null }],
      units: { temperature: "°C", windSpeed: "km/h" },
      fetchedAt: 1,
    },
    invalid: [{ timezone: "UTC", current: {}, daily: [], units: {}, fetchedAt: 1 }],
  },
  {
    name: "geocode",
    mini: miniWidgets.geocodeResponseSchema,
    full: fullWidgets.geocodeResponseSchema,
    valid: {
      results: [{ id: 1, name: "A", region: null, country: "B", latitude: 1, longitude: 2 }],
    },
    invalid: [{ results: [{ id: "1", name: "A" }] }],
  },
  {
    name: "agenda feeds",
    mini: miniWidgets.agendaFeedsResponseSchema,
    full: fullWidgets.agendaFeedsResponseSchema,
    valid: { feeds: [{ id: "f", name: "Work", host: "cal.lan" }] },
    invalid: [{ feeds: [{ id: "f", name: "Work", url: "https://cal.lan/secret" }] }],
  },
  {
    name: "agenda",
    mini: miniWidgets.agendaResponseSchema,
    full: fullWidgets.agendaResponseSchema,
    valid: {
      events: [
        {
          id: "e",
          feedId: "f",
          title: "Standup",
          location: "Room 1",
          allDay: true,
          start: "2026-10-10",
          end: "2026-10-11",
        },
      ],
      errors: [],
    },
    invalid: [{ events: [], errors: [{ feedId: "f" }] }],
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
    invalid: [
      { device: null, effective: settings, settings: { layout: {} }, stored: true },
      {
        device: null,
        effective: settings,
        settings: { ...settings, layout: { ...settings.layout, linkPreference: "lan" } },
        stored: true,
      },
    ],
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

  it("read a service cached before external URLs, links and tags with none of them", () => {
    const { external_url: _external, links: _links, tags: _tags, ...older } = service;
    const expected = { ...older, external_url: null, links: [], tags: [] };
    expect(mini.serviceSchema.parse(older)).toEqual(expected);
    expect(full.serviceSchema.parse(older)).toEqual(expected);
    // Each parse gets its own lists, so editing one never changes another.
    expect(mini.serviceSchema.parse(older).tags).not.toBe(mini.serviceSchema.parse(older).tags);
  });

  it("read settings cached before link preferences as auto, without inventing an override", () => {
    const { linkPreference: _preference, ...olderLayout } = settings.layout;
    const older = { ...settings, layout: olderLayout };
    const response = {
      device: { id: "device-1", name: null, overrides: { layout: { mode: "rows" } } },
      effective: older,
      settings: older,
      stored: true,
    };
    const parsed = mini.dashboardSettingsResponseSchema.parse(response);
    expect(parsed).toEqual(fullSettings.parse(response));
    expect(parsed.settings.layout.linkPreference).toBe("auto");
    expect(parsed.device?.overrides).toEqual({ layout: { mode: "rows" } });
  });

  it("fill in widgets for settings cached before they existed", () => {
    const { widgets: _widgets, ...older } = settings;
    const parsed = mini.dashboardSettingsResponseSchema.parse({
      device: null,
      effective: older,
      settings: older,
      stored: true,
    });
    expect(parsed.settings.widgets).toEqual(DEFAULT_DASHBOARD_SETTINGS.widgets);
  });

  it("parse success replies and import summaries", () => {
    expect(mini.successResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(mini.successResponseSchema.safeParse({ success: false }).success).toBe(false);
    expect(mini.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })).toEqual(
      full.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })
    );
  });
});
