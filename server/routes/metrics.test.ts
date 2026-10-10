import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { hostSnapshotSchema, metricHistorySchema } from "@shared/host-schemas";
import { metricsResponseSchema } from "@shared/schemas";
import { app } from "../app";
import { getDb } from "../db";
import { bucketStart, MINUTE_MS, QUARTER_HOUR_MS } from "../history/rollup";
import { stopCollection, tickCollection } from "../metrics";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";

afterEach(() => stopCollection());

describe("metrics routes", () => {
  it("serves the latest host snapshot, uncached", async () => {
    const response = await app.request("/api/metrics/host");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(hostSnapshotSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("keeps serving the strip's samples in their original shape", async () => {
    stopCollection();
    const sample = tickCollection();
    const response = await app.request("/api/metrics?window=60");
    const { samples } = metricsResponseSchema.parse(await response.json());

    expect(samples.at(-1)).toEqual(sample!);
    expect(Object.keys(sample!).sort()).toEqual(["cpu", "disk", "ram", "ts"]);
  });
});

describe("metric history route", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = setupTestDatabase("orbitdash-history-route-");
  });

  afterEach(() => cleanupTestDatabase(dataDir));

  function insertRow(table: string, ts: number, cpu: number) {
    getDb()
      .prepare(`INSERT INTO ${table} (ts, weight_ms, cpu_avg, cpu_max) VALUES (?, 60000, ?, ?)`)
      .run(ts, cpu, cpu + 5);
  }

  async function fetchHistory(query: string) {
    const response = await app.request(`/api/metrics/history${query}`);
    return { response, body: (await response.json()) as unknown };
  }

  it("serves each range at its resolution, uncached", async () => {
    const minute = bucketStart(Date.now(), MINUTE_MS) - 10 * MINUTE_MS;
    const quarter = bucketStart(Date.now(), QUARTER_HOUR_MS) - 4 * QUARTER_HOUR_MS;
    insertRow("metric_history_1m", minute, 12.34);
    insertRow("metric_history_15m", quarter, 56.78);

    const expected = {
      "1h": { resolutionMs: MINUTE_MS, ts: minute, cpu: 12.3 },
      "24h": { resolutionMs: 5 * MINUTE_MS, ts: bucketStart(minute, 5 * MINUTE_MS), cpu: 12.3 },
      "7d": { resolutionMs: QUARTER_HOUR_MS, ts: quarter, cpu: 56.8 },
      "30d": { resolutionMs: QUARTER_HOUR_MS, ts: quarter, cpu: 56.8 },
    };
    for (const [range, { resolutionMs, ts, cpu }] of Object.entries(expected)) {
      const { response, body } = await fetchHistory(`?range=${range}`);
      const history = metricHistorySchema.parse(body);
      const index = history.ts.indexOf(ts);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(history.range).toBe(range as typeof history.range);
      expect(history.resolutionMs).toBe(resolutionMs);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(history.series.cpu.avg[index]).toBe(cpu);
      expect(history.series.cpu.max[index]).toBe(Math.round((cpu + 5) * 10) / 10);
      expect(history.series.memory.avg[index]).toBeNull();
    }
  });

  it("compresses the response for clients that accept it", async () => {
    const start = bucketStart(Date.now(), MINUTE_MS) - 50 * MINUTE_MS;
    for (let minute = 0; minute < 40; minute++) {
      insertRow("metric_history_1m", start + minute * MINUTE_MS, 10 + minute / 3);
    }

    const response = await app.request("/api/metrics/history?range=1h", {
      headers: { "Accept-Encoding": "gzip" },
    });
    const json = new TextDecoder().decode(Bun.gunzipSync(await response.arrayBuffer()));

    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(metricHistorySchema.parse(JSON.parse(json)).ts.length).toBeGreaterThanOrEqual(40);
  });

  it("defaults to the last hour", async () => {
    const { response, body } = await fetchHistory("");

    expect(response.status).toBe(200);
    expect(metricHistorySchema.parse(body)).toMatchObject({ range: "1h", resolutionMs: MINUTE_MS });
  });

  it("rejects other ranges", async () => {
    for (const query of ["?range=2h", "?range=", "?range=1H"]) {
      const { response, body } = await fetchHistory(query);

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "range must be one of 1h, 24h, 7d, 30d" });
    }
  });
});
