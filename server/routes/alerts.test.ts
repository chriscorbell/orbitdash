import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_ALERT_RULES } from "@shared/alerts";
import type { ServerEvent } from "@shared/events";
import type { AlertsResponse, HostSnapshot } from "@shared/types";
import { metricAlerts } from "../alerts/service";
import { app } from "../app";
import { getDb } from "../db";
import { subscribeEvents } from "../events";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";

let dataDir: string;

function snapshot(cpu: number, rootUsedPercent = 10): HostSnapshot {
  return {
    version: 1,
    ts: 0,
    intervalMs: 1000,
    cpu: { usage: cpu, cores: [], load: null, frequencyMhz: null, temperatureCelsius: null },
    memory: null,
    temperatures: [],
    filesystems: [
      {
        mountpoint: "/",
        device: "/dev/sda1",
        type: "ext4",
        totalBytes: 100,
        usedBytes: rootUsedPercent,
        availableBytes: 100 - rootUsedPercent,
      },
    ],
    disks: [],
    network: [],
  };
}

async function putRules(rules: unknown) {
  return app.request("/api/alerts/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
}

beforeEach(() => {
  dataDir = createTestDataDir("orbitdash-alerts-");
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
  metricAlerts.resetForTesting();
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(dataDir);
});

describe("alerts routes", () => {
  it("starts with the default rules and nothing firing", async () => {
    const body = (await (await app.request("/api/alerts")).json()) as AlertsResponse;
    expect(body).toEqual({ active: [], recent: [], rules: DEFAULT_ALERT_RULES });
  });

  it("saves rule changes, keeping the others, and rejects invalid ones", async () => {
    const response = await putRules([
      { metric: "cpu", enabled: false, threshold: 80, durationSec: 600 },
    ]);
    expect(response.status).toBe(200);
    const { rules } = (await response.json()) as { rules: AlertsResponse["rules"] };
    expect(rules[0]).toEqual({ metric: "cpu", enabled: false, threshold: 80, durationSec: 600 });
    expect(rules[1]).toEqual(DEFAULT_ALERT_RULES[1]);

    for (const invalid of [
      [{ metric: "cpu", enabled: true, threshold: 101, durationSec: 60 }],
      [{ metric: "temperature", enabled: true, threshold: 20, durationSec: 60 }],
      [{ metric: "cpu", enabled: true, threshold: 90, durationSec: 7 }],
      [{ metric: "gpu", enabled: true, threshold: 90, durationSec: 60 }],
      [
        { metric: "cpu", enabled: true, threshold: 90, durationSec: 60 },
        { metric: "cpu", enabled: true, threshold: 80, durationSec: 60 },
      ],
    ]) {
      expect((await putRules(invalid)).status).toBe(400);
    }
  });

  it("fires and resolves alerts from readings, storing them and publishing events", async () => {
    await putRules([
      { metric: "cpu", enabled: true, threshold: 90, durationSec: 0 },
      { metric: "disk", enabled: true, threshold: 85, durationSec: 0 },
    ]);
    const events: ServerEvent[] = [];
    const stop = subscribeEvents(["alerts"], (event) => events.push(event));

    metricAlerts.observe(snapshot(97, 90), 1_000);
    let body = (await (await app.request("/api/alerts")).json()) as AlertsResponse;
    expect(body.active.map((alert) => alert.metric).sort()).toEqual(["cpu", "disk"]);

    metricAlerts.observe(snapshot(40, 90), 2_000);
    body = (await (await app.request("/api/alerts")).json()) as AlertsResponse;
    expect(body.active.map((alert) => alert.metric)).toEqual(["disk"]);
    expect(body.recent).toEqual([
      expect.objectContaining({ metric: "cpu", peak: 97, resolvedAt: 2_000 }),
    ]);
    expect(events.filter((event) => event.type === "alert")).toHaveLength(3);
    stop();
  });

  it("closes alerts a previous run left firing and prunes old ones", () => {
    getDb()
      .prepare(
        `INSERT INTO metric_alerts (id, metric, subject, threshold, duration_sec, value, peak, started_at, fired_at, resolved_at)
         VALUES ('old', 'cpu', NULL, 90, 60, 95, 99, 0, 60000, 1000), ('left', 'cpu', NULL, 90, 60, 95, 99, 0, 60000, NULL)`
      )
      .run();
    const body = metricAlerts.read(5_000);
    expect(body.recent.map((alert) => [alert.id, alert.resolvedAt])).toEqual([
      ["left", 5_000],
      ["old", 1_000],
    ]);
    expect(metricAlerts.prune(30 * 24 * 60 * 60 * 1000 + 3_000)).toBe(1);
  });

  it("falls back to default rules when the stored ones are unreadable", () => {
    getDb().prepare("INSERT INTO settings (key, value) VALUES ('alerts.rules', '{bad')").run();
    expect(metricAlerts.read().rules).toEqual(DEFAULT_ALERT_RULES);
  });
});
