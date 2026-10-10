import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ConfigChangedEvent, ConfigScope, ServerEvent, StatusEvent } from "@shared/events";
import { getDb } from "../db";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import type { CheckRequest } from "./checker";
import {
  CHANGE_SPREAD_MS,
  createStatusMonitor,
  STARTUP_SPREAD_MS,
  toScheduledCheck,
} from "./monitor";
import { CONFIRM_DELAY_MS } from "./scheduler";
import type { CheckResult } from "./state";
import { recordCheckResult, writeStatus } from "./store";
import { unknownStatus } from "./state";

const START = Date.UTC(2026, 9, 10, 12, 0, 0);
const PASSED: CheckResult = { ok: true, latencyMs: 30, statusCode: 200, error: null };
const FAILED: CheckResult = {
  ok: false,
  latencyMs: null,
  statusCode: null,
  error: "Connection refused",
};

let dataDir: string;

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-status-monitor-");
});

afterEach(() => {
  cleanupTestDatabase(dataDir);
});

interface ServiceFields {
  url?: string;
  check_enabled?: number;
  check_method?: "http" | "tcp";
  check_target?: string | null;
  check_interval?: number;
  check_ignore_tls?: number;
}

function insertService(id: string, fields: ServiceFields = {}) {
  getDb()
    .prepare(
      `INSERT INTO services (id, name, url, open_in_new_tab, created_at, updated_at, position,
                             check_enabled, check_method, check_target, check_interval, check_ignore_tls)
       VALUES (?, ?, ?, 1, 1, 1, 0, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      id,
      fields.url ?? `http://${id}.lan/`,
      fields.check_enabled ?? 1,
      fields.check_method ?? "http",
      fields.check_target ?? null,
      fields.check_interval ?? 60,
      fields.check_ignore_tls ?? 0
    );
}

function updateService(id: string, fields: ServiceFields) {
  for (const [column, value] of Object.entries(fields)) {
    getDb().prepare(`UPDATE services SET ${column} = ? WHERE id = ?`).run(value, id);
  }
}

function harness({
  random = () => 0.5,
  getDatabase = getDb,
}: { random?: () => number; getDatabase?: typeof getDb } = {}) {
  let time = START;
  let configListener: ((event: ConfigChangedEvent) => void) | null = null;
  const events: ServerEvent[] = [];
  const runs: Array<{ request: CheckRequest; resolve: (result: CheckResult) => void }> = [];
  const monitor = createStatusMonitor({
    getDatabase,
    now: () => time,
    random,
    publish: (event) => events.push(event),
    runCheck: (request) => new Promise((resolve) => runs.push({ request, resolve })),
    subscribeConfig: (listener) => {
      configListener = listener;
      return () => {
        configListener = null;
      };
    },
  });

  return {
    monitor,
    events,
    runs,
    statusEvents: () => events.filter((event): event is StatusEvent => event.type === "status"),
    at: (offset: number) => (time = START + offset),
    changeConfig: (scope: ConfigScope) =>
      configListener?.({ type: "config.changed", scope, origin: null }),
    listening: () => configListener !== null,
  };
}

const settle = () => Bun.sleep(0);
const count = (sql: string) => (getDb().prepare(sql).get() as { n: number }).n;

describe("status monitor", () => {
  it("checks only services with checks on, spreading the first runs out", () => {
    insertService("a");
    insertService("b");
    insertService("off", { check_enabled: 0 });
    const randoms = [0.1, 0.9];
    const h = harness({ random: () => randoms.shift() ?? 0.5 });

    h.monitor.start();
    expect(h.listening()).toBe(true);
    expect(h.statusEvents().map((event) => [event.id, event.status?.state])).toEqual([
      ["a", "unknown"],
      ["b", "unknown"],
    ]);

    h.at(0.1 * STARTUP_SPREAD_MS);
    h.monitor.tick();
    expect(h.runs.map((run) => run.request.target)).toEqual([
      { method: "http", url: "http://a.lan/" },
    ]);

    h.at(0.9 * STARTUP_SPREAD_MS);
    h.monitor.tick();
    expect(h.runs).toHaveLength(2);
    h.monitor.stop();
  });

  it("stores and publishes each result, confirming a first failure quickly", async () => {
    insertService("a");
    const h = harness();
    h.monitor.start();
    const firstRun = 0.5 * STARTUP_SPREAD_MS;

    h.at(firstRun);
    h.monitor.tick();
    h.runs[0].resolve(PASSED);
    await settle();

    expect(h.statusEvents().at(-1)).toEqual({
      type: "status",
      id: "a",
      status: {
        id: "a",
        state: "up",
        latencyMs: 30,
        statusCode: 200,
        error: null,
        checkedAt: START + firstRun,
        changedAt: START + firstRun,
      },
    });
    expect(count("SELECT COUNT(*) AS n FROM status_results")).toBe(1);
    expect(getDb().prepare("SELECT checks, failures FROM status_hourly").get()).toEqual({
      checks: 1,
      failures: 0,
    });
    expect(h.monitor.list()).toEqual([h.statusEvents().at(-1)!.status!]);

    h.at(firstRun + 60_000);
    h.monitor.tick();
    h.runs[1].resolve(FAILED);
    await settle();
    expect(h.statusEvents().at(-1)?.status).toMatchObject({
      state: "up",
      error: "Connection refused",
    });

    h.at(firstRun + 60_000 + CONFIRM_DELAY_MS);
    h.monitor.tick();
    expect(h.runs).toHaveLength(3);
    h.runs[2].resolve(FAILED);
    await settle();
    expect(h.statusEvents().at(-1)?.status).toMatchObject({
      state: "down",
      changedAt: START + firstRun + 60_000 + CONFIRM_DELAY_MS,
    });
    expect(getDb().prepare("SELECT checks, failures FROM status_hourly").get()).toEqual({
      checks: 3,
      failures: 2,
    });
    h.monitor.stop();
  });

  it("reloads checks after a layout change, but not after a settings change", async () => {
    insertService("a");
    insertService("b", { check_enabled: 0 });
    const h = harness({ random: () => 0 });
    h.monitor.start();
    h.monitor.tick();
    expect(h.runs).toHaveLength(1);
    h.events.length = 0;

    updateService("a", { check_enabled: 0 });
    updateService("b", { check_enabled: 1 });
    h.changeConfig("settings");
    h.monitor.tick();
    expect(h.events).toEqual([]);

    h.changeConfig("layout");
    h.monitor.tick();
    expect(h.statusEvents().map((event) => [event.id, event.status?.state ?? null])).toEqual([
      ["a", null],
      ["b", "unknown"],
    ]);
    expect(h.runs[0].request.signal?.aborted).toBe(true);
    expect(h.runs.at(-1)?.request.target).toEqual({ method: "http", url: "http://b.lan/" });
    expect(count("SELECT COUNT(*) AS n FROM service_status WHERE service_id = 'a'")).toBe(0);

    // A changed target starts over as unknown.
    h.runs.at(-1)!.resolve(PASSED);
    await settle();
    h.events.length = 0;
    updateService("b", { check_method: "tcp", check_target: "b.lan:22" });
    h.at(10_000);
    h.monitor.refresh();
    h.monitor.tick();
    expect(h.statusEvents().map((event) => event.status?.state)).toEqual(["unknown"]);
    expect(h.runs.at(-1)?.request.target).toEqual({ method: "tcp", host: "b.lan", port: 22 });
    h.monitor.stop();
  });

  it("runs a check that was just turned on within a couple of seconds", () => {
    insertService("a", { check_enabled: 0 });
    const h = harness({ random: () => 1 });
    h.monitor.start();

    updateService("a", { check_enabled: 1 });
    h.changeConfig("all");
    h.monitor.tick();
    expect(h.runs).toHaveLength(0);

    h.at(CHANGE_SPREAD_MS);
    h.monitor.tick();
    expect(h.runs).toHaveLength(1);
    h.monitor.stop();
  });

  it("keeps statuses and their cadence across a restart", async () => {
    insertService("a");
    insertService("moved", { check_target: "http://old.lan/" });
    insertService("dropped");
    const h = harness({ random: () => 0 });
    h.monitor.start();
    h.monitor.tick();
    for (const run of h.runs) run.resolve(PASSED);
    await settle();
    h.monitor.stop();

    updateService("moved", { check_target: "http://new.lan/" });
    updateService("dropped", { check_enabled: 0 });
    h.events.length = 0;
    h.at(10_000);
    h.monitor.start();

    expect(h.statusEvents().map((event) => [event.id, event.status?.state])).toEqual([
      ["moved", "unknown"],
    ]);
    expect(h.monitor.list().find((status) => status.id === "a")).toMatchObject({
      state: "up",
      changedAt: START,
    });
    expect(count("SELECT COUNT(*) AS n FROM service_status WHERE service_id = 'dropped'")).toBe(0);

    const before = h.runs.length;
    h.monitor.tick();
    // "moved" starts over at once; "a" waits for a minute after its last check.
    expect(h.runs.slice(before).map((run) => run.request.target)).toEqual([
      { method: "http", url: "http://new.lan/" },
    ]);
    h.at(60_000);
    h.monitor.tick();
    expect(h.runs.at(-1)?.request.target).toEqual({ method: "http", url: "http://a.lan/" });
    h.monitor.stop();
  });

  it("writes nothing for checks that finish after it stopped", async () => {
    insertService("a");
    const h = harness({ random: () => 0 });
    h.monitor.start();
    h.monitor.tick();
    h.events.length = 0;

    h.monitor.stop();
    expect(h.listening()).toBe(false);
    expect(h.runs[0].request.signal?.aborted).toBe(true);
    h.runs[0].resolve(PASSED);
    await settle();

    expect(h.events).toEqual([]);
    expect(count("SELECT COUNT(*) AS n FROM status_results")).toBe(0);
    h.monitor.tick();
    expect(h.runs).toHaveLength(1);
  });

  it("reports a failing database at most once a minute and carries on", async () => {
    insertService("a", { check_interval: 15 });
    const h = harness({ random: () => 0 });
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    h.monitor.start();
    getDb().exec("DROP TABLE status_results");
    h.events.length = 0;

    for (const offset of [0, 15_000]) {
      h.at(offset);
      h.monitor.tick();
      h.runs.at(-1)!.resolve(PASSED);
      await settle();
    }

    const logged = errorLog.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(logged.filter((line) => line.event === "status.write_failed")).toHaveLength(1);
    expect(h.events).toEqual([]);
    expect(h.runs).toHaveLength(2);
    errorLog.mockRestore();
    h.monitor.stop();
  });
});

describe("status monitor reloads", () => {
  it("keep trying after the database fails, logging once a minute", () => {
    insertService("a", { check_enabled: 0 });
    let failing = false;
    const h = harness({
      random: () => 0,
      getDatabase: () => {
        if (failing) throw new Error("disk I/O error");
        return getDb();
      },
    });
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    h.monitor.start();

    updateService("a", { check_enabled: 1 });
    h.changeConfig("layout");
    failing = true;
    h.monitor.tick();
    h.monitor.tick();
    const logged = errorLog.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(logged).toEqual([
      expect.objectContaining({ event: "status.reload_failed", message: "disk I/O error" }),
    ]);
    expect(h.statusEvents()).toEqual([]);

    failing = false;
    h.monitor.tick();
    expect(h.statusEvents().map((event) => [event.id, event.status?.state])).toEqual([
      ["a", "unknown"],
    ]);
    expect(h.runs).toHaveLength(1);
    errorLog.mockRestore();
    h.monitor.stop();
  });
});

describe("status reads", () => {
  it("lists services with checks on, ignoring statuses left from an older target", () => {
    insertService("a");
    insertService("b", { check_method: "tcp" });
    insertService("off", { check_enabled: 0 });
    const db = getDb();
    writeStatus(db, { ...unknownStatus("a", "http http://elsewhere/"), state: "up" });
    writeStatus(db, { ...unknownStatus("b", "tcp b.lan:80"), state: "down", failures: 2 });
    writeStatus(db, { ...unknownStatus("off", "http http://off.lan/"), state: "up" });

    const { monitor } = harness();
    expect(monitor.list().map((status) => [status.id, status.state])).toEqual([
      ["a", "unknown"],
      ["b", "down"],
    ]);
  });

  it("serves history from raw results and hourly totals", () => {
    insertService("a");
    const db = getDb();
    const status = unknownStatus("a", "http http://a.lan/");
    recordCheckResult(db, status, PASSED, START - 60_000);
    recordCheckResult(db, status, FAILED, START - 30_000);
    recordCheckResult(db, status, { ...PASSED, latencyMs: 2_500 }, START - 2 * 86_400_000);
    // The same millisecond twice counts once.
    recordCheckResult(db, status, PASSED, START - 60_000);

    const { monitor } = harness();
    const day = monitor.history("a", "24h", START)!;
    expect(day.uptime).toBe(50);
    // START is on the hour, so the last half hour (holding now) is still empty.
    expect(day.buckets.at(-1)).toMatchObject({ ts: START, checks: 0 });
    expect(day.buckets.at(-2)).toMatchObject({ checks: 2, failures: 1, latencyMs: 30 });

    const month = monitor.history("a", "30d", START)!;
    expect(month.uptime).toBe(66.66);
    expect(month.buckets.reduce((sum, bucket) => sum + bucket.slow, 0)).toBe(1);

    expect(monitor.history("missing", "24h", START)).toBeNull();
  });

  it("prunes old history and history of services that are gone for good", () => {
    insertService("a");
    const db = getDb();
    db.prepare(
      "INSERT INTO service_trash (id, data, deleted_at) VALUES ('trashed', '{}', 1)"
    ).run();
    for (const id of ["a", "trashed", "gone"]) {
      const status = unknownStatus(id, "k");
      recordCheckResult(db, status, PASSED, START - 1_000);
      recordCheckResult(db, status, PASSED, START - 25 * 3_600_000);
      recordCheckResult(db, status, PASSED, START - 31 * 86_400_000);
    }

    const { monitor } = harness();
    expect(monitor.prune(START)).toBeGreaterThan(0);

    const ids = (table: string) =>
      (
        db.prepare(`SELECT DISTINCT service_id AS id FROM ${table} ORDER BY id`).all() as Array<{
          id: string;
        }>
      ).map((row) => row.id);
    expect(ids("status_results")).toEqual(["a", "trashed"]);
    expect(ids("service_status")).toEqual(["a", "trashed"]);
    expect(count("SELECT COUNT(*) AS n FROM status_results WHERE service_id = 'a'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM status_hourly WHERE service_id = 'a'")).toBe(2);
  });
});

describe("toScheduledCheck", () => {
  const row = {
    id: "a",
    url: "https://nas.lan/",
    check_method: "http" as const,
    check_target: null,
    check_interval: 30,
    check_ignore_tls: 1,
  };

  it("names each target, and certificate handling only for HTTP", () => {
    expect(toScheduledCheck(row)).toEqual({
      id: "a",
      intervalMs: 30_000,
      key: "http https://nas.lan/ insecure",
      ignoreTls: true,
      target: { method: "http", url: "https://nas.lan/" },
    });
    expect(toScheduledCheck({ ...row, check_method: "tcp" })).toMatchObject({
      key: "tcp nas.lan:443",
      ignoreTls: false,
      target: { method: "tcp", host: "nas.lan", port: 443 },
    });
  });

  it("skips a service without a usable address", () => {
    expect(toScheduledCheck({ ...row, url: "ftp://nas.lan/" })).toBeNull();
  });
});
