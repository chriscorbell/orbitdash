import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "./app";
import * as authService from "./auth/service";
import { dockerMonitor } from "./docker/monitor";
import { renderPrometheus, type PrometheusInput } from "./prometheus";
import { readPrometheusConfig } from "./routes/prometheus";
import { initializeServer, shutdown } from "./runtime";
import { cleanupTestDatabase, setupTestDatabase } from "./test-utils";
import type { Service } from "@shared/types";

const service = (id: string, name: string, extra: Partial<Service> = {}): Service => ({
  id,
  name,
  url: `http://${id}.lan/`,
  description: null,
  icon: null,
  icon_source_url: null,
  category: "Media",
  category_id: "c",
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
  check_enabled: true,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
  ...extra,
});

const status = (
  serviceId: string,
  state: "up" | "degraded" | "down" | "unknown",
  latencyMs: number | null
) => ({
  serviceId,
  targetKey: "k",
  state,
  failures: 0,
  latencyMs,
  statusCode: 200,
  error: null,
  checkedAt: 1,
  changedAt: 1,
});

const input: PrometheusInput = {
  snapshot: {
    version: 1,
    ts: 1,
    intervalMs: 1000,
    cpu: {
      usage: 12.5,
      cores: [
        { id: 0, usage: 20, frequencyMhz: null },
        { id: 1, usage: null, frequencyMhz: null },
      ],
      load: { one: 0.5, five: 0.4, fifteen: 0.3 },
      frequencyMhz: null,
      temperatureCelsius: null,
    },
    memory: {
      totalBytes: 16,
      usedBytes: 6,
      availableBytes: 10,
      cachedBytes: null,
      swapTotalBytes: null,
      swapUsedBytes: null,
    },
    temperatures: [{ id: "hwmon0/temp1", chip: "coretemp", label: null, celsius: 52 }],
    filesystems: [
      {
        mountpoint: '/mnt/"media"',
        device: "/dev/sda1",
        type: "ext4",
        totalBytes: 100,
        usedBytes: 40,
        availableBytes: 60,
      },
    ],
    disks: [{ name: "sda", readBytesPerSec: 1, writeBytesPerSec: null }],
    network: [{ name: "eth0", rxBytesPerSec: 3, txBytesPerSec: 4 }],
  },
  uptimeSeconds: 99,
  services: [
    service("a", "Jellyfin"),
    service("b", "Plex\\TV", { category: null }),
    service("c", "Off", { check_enabled: false }),
    service("d", "New"),
  ],
  statuses: [
    status("a", "degraded", 2500),
    status("b", "down", null),
    status("c", "up", 5),
    status("d", "unknown", null),
    status("gone", "up", 1),
  ],
  docker: {
    configured: true,
    available: true,
    error: null,
    containers: [
      {
        id: "1",
        name: "web",
        image: "nginx",
        state: "running",
        status: "Up",
        health: "healthy",
        createdAt: 0,
        ports: [],
        composeProject: null,
        cpuPercent: 1.5,
        memoryBytes: 1024,
        memoryLimitBytes: null,
      },
      {
        id: "2",
        name: "job",
        image: "busybox",
        state: "exited",
        status: "Exited",
        health: null,
        createdAt: 0,
        ports: [],
        composeProject: null,
        cpuPercent: null,
        memoryBytes: null,
        memoryLimitBytes: null,
      },
    ],
    updatedAt: 1,
  },
  alertsFiring: 2,
};

describe("renderPrometheus", () => {
  it("writes host, service and container gauges in text format", () => {
    const text = renderPrometheus(input);
    for (const line of [
      "# TYPE orbitdash_cpu_usage_percent gauge",
      "orbitdash_cpu_usage_percent 12.5",
      'orbitdash_cpu_core_usage_percent{core="0"} 20',
      'orbitdash_load_average{period="15m"} 0.3',
      "orbitdash_memory_used_bytes 6",
      'orbitdash_filesystem_used_bytes{mountpoint="/mnt/\\"media\\"",device="/dev/sda1",fstype="ext4"} 40',
      'orbitdash_disk_read_bytes_per_second{device="sda"} 1',
      'orbitdash_network_transmit_bytes_per_second{interface="eth0"} 4',
      'orbitdash_temperature_celsius{chip="coretemp",sensor="hwmon0/temp1"} 52',
      "orbitdash_alerts_firing 2",
      "orbitdash_host_uptime_seconds 99",
      'orbitdash_service_up{service="Jellyfin",category="Media"} 1',
      'orbitdash_service_slow{service="Jellyfin",category="Media"} 1',
      'orbitdash_service_up{service="Plex\\\\TV",category=""} 0',
      'orbitdash_service_response_milliseconds{service="Jellyfin",category="Media"} 2500',
      "orbitdash_docker_up 1",
      'orbitdash_docker_containers{state="running"} 1',
      'orbitdash_container_running{container="job",image="busybox"} 0',
      'orbitdash_container_healthy{container="web"} 1',
      'orbitdash_container_memory_bytes{container="web"} 1024',
    ]) {
      expect(text).toContain(`${line}\n`);
    }
    // Series without a value, services without a check result and empty metrics are left out.
    expect(text).not.toContain('core="1"');
    expect(text).not.toContain("orbitdash_swap_total_bytes");
    expect(text).not.toContain('service="Off"');
    expect(text).not.toContain('service="New"');
    expect(text).not.toContain('container_healthy{container="job"}');
    expect(text.match(/# HELP orbitdash_service_up /g)).toHaveLength(1);
  });

  it("covers missing pieces and odd numbers", () => {
    const text = renderPrometheus({
      ...input,
      snapshot: {
        ...input.snapshot,
        memory: null,
        cpu: { ...input.snapshot.cpu, load: null, usage: Number.NaN },
      },
      docker: { ...input.docker, available: false, containers: [] },
      uptimeSeconds: Number.POSITIVE_INFINITY,
      alertsFiring: Number.NEGATIVE_INFINITY,
    });
    expect(text).toContain("orbitdash_cpu_usage_percent NaN\n");
    expect(text).toContain("orbitdash_host_uptime_seconds +Inf\n");
    expect(text).toContain("orbitdash_alerts_firing -Inf\n");
    expect(text).toContain("orbitdash_docker_up 0\n");
    expect(text).not.toContain("orbitdash_load_average");
    expect(text).not.toContain("orbitdash_memory_total_bytes");
    expect(text).not.toContain("orbitdash_docker_containers");
    expect(
      renderPrometheus({
        ...input,
        docker: { ...input.docker, configured: false, available: false },
      })
    ).not.toContain("orbitdash_docker_up");
  });
});

describe("GET /metrics", () => {
  let dataDir: string;
  const env = { ...process.env };

  beforeEach(() => {
    dataDir = setupTestDatabase("orbitdash-prometheus-");
    initializeServer({
      dataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });
  });

  afterEach(() => {
    process.env.ORBITDASH_PROMETHEUS = env.ORBITDASH_PROMETHEUS;
    process.env.ORBITDASH_PROMETHEUS_TOKEN = env.ORBITDASH_PROMETHEUS_TOKEN;
    if (env.ORBITDASH_PROMETHEUS === undefined) delete process.env.ORBITDASH_PROMETHEUS;
    if (env.ORBITDASH_PROMETHEUS_TOKEN === undefined) delete process.env.ORBITDASH_PROMETHEUS_TOKEN;
    shutdown();
    cleanupTestDatabase(dataDir);
  });

  it("is off unless turned on", async () => {
    delete process.env.ORBITDASH_PROMETHEUS;
    expect((await app.request("/metrics")).status).toBe(404);
    expect(
      readPrometheusConfig({ ORBITDASH_PROMETHEUS: " On ", ORBITDASH_PROMETHEUS_TOKEN: " t " })
    ).toEqual({
      enabled: true,
      token: "t",
    });
    expect(readPrometheusConfig({})).toEqual({ enabled: false, token: null });
  });

  it("serves the text format, with a bearer token when one is set", async () => {
    process.env.ORBITDASH_PROMETHEUS = "true";
    const docker = spyOn(dockerMonitor, "snapshot").mockReturnValue({
      ...input.docker,
      configured: false,
      available: false,
      containers: [],
    });
    const open = await app.request("/metrics");
    expect(open.status).toBe(200);
    expect(open.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(await open.text()).toContain("# TYPE orbitdash_host_uptime_seconds gauge");

    process.env.ORBITDASH_PROMETHEUS_TOKEN = "s3cret";
    const missing = await app.request("/metrics");
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect(
      (await app.request("/metrics", { headers: { Authorization: "Bearer nope" } })).status
    ).toBe(401);
    expect(
      (await app.request("/metrics", { headers: { Authorization: "bearer s3cret" } })).status
    ).toBe(200);
    docker.mockRestore();
  });

  it("needs a token while sign-in is on", async () => {
    process.env.ORBITDASH_PROMETHEUS = "true";
    delete process.env.ORBITDASH_PROMETHEUS_TOKEN;
    const auth = spyOn(authService, "getAuthConfig").mockReturnValue({
      ...authService.OPEN_AUTH_CONFIG,
      mode: "password",
    });
    const response = await app.request("/metrics");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "set ORBITDASH_PROMETHEUS_TOKEN to scrape while sign-in is on",
    });
    auth.mockRestore();
  });
});
