import { afterEach, describe, expect, it } from "bun:test";
import { hostSnapshotSchema } from "@shared/host-schemas";
import { metricsResponseSchema } from "@shared/schemas";
import { app } from "../app";
import { stopCollection, tickCollection } from "../metrics";

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
