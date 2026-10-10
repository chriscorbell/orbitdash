import { describe, expect, it } from "bun:test";
import {
  applyCheckResult,
  isSlow,
  needsConfirmation,
  toServiceStatus,
  unknownStatus,
  type CheckResult,
} from "./state";

const passed = (latencyMs = 40, statusCode: number | null = 200): CheckResult => ({
  ok: true,
  latencyMs,
  statusCode,
  error: null,
});
const failed = (error = "Connection refused", statusCode: number | null = null): CheckResult => ({
  ok: false,
  latencyMs: null,
  statusCode,
  error,
});

describe("applyCheckResult", () => {
  it("turns an unchecked service up or down on its first result", () => {
    const start = unknownStatus("svc", "http https://a/");

    expect(applyCheckResult(start, passed(), 1_000)).toEqual({
      ...start,
      state: "up",
      failures: 0,
      latencyMs: 40,
      statusCode: 200,
      error: null,
      checkedAt: 1_000,
      changedAt: 1_000,
    });
    expect(applyCheckResult(start, failed(), 1_000)).toMatchObject({
      state: "down",
      failures: 1,
      latencyMs: null,
      error: "Connection refused",
      changedAt: 1_000,
    });
  });

  it("marks slow answers degraded without moving the last change", () => {
    const up = applyCheckResult(unknownStatus("svc", "k"), passed(), 1_000);
    const slow = applyCheckResult(up, passed(2_500), 2_000);

    expect(slow).toMatchObject({ state: "degraded", latencyMs: 2_500, changedAt: 1_000 });
    expect(applyCheckResult(slow, passed(30), 3_000)).toMatchObject({
      state: "up",
      changedAt: 1_000,
    });
  });

  it("waits for a second failure in a row before a reachable service turns down", () => {
    const up = applyCheckResult(unknownStatus("svc", "k"), passed(55), 1_000);
    const blip = applyCheckResult(up, failed("Timed out"), 2_000);

    expect(blip).toMatchObject({
      state: "up",
      failures: 1,
      latencyMs: 55,
      error: "Timed out",
      checkedAt: 2_000,
      changedAt: 1_000,
    });
    expect(needsConfirmation(blip)).toBe(true);

    const down = applyCheckResult(blip, failed("HTTP 503", 503), 3_000);
    expect(down).toMatchObject({
      state: "down",
      failures: 2,
      latencyMs: null,
      statusCode: 503,
      changedAt: 3_000,
    });
    expect(needsConfirmation(down)).toBe(false);
  });

  it("recovers from one blip and comes back up from down at once", () => {
    const up = applyCheckResult(unknownStatus("svc", "k"), passed(), 1_000);
    const recovered = applyCheckResult(applyCheckResult(up, failed(), 2_000), passed(), 3_000);
    expect(recovered).toMatchObject({ state: "up", failures: 0, error: null, changedAt: 1_000 });

    const down = applyCheckResult(unknownStatus("svc", "k"), failed(), 1_000);
    const stillDown = applyCheckResult(down, failed(), 2_000);
    expect(stillDown).toMatchObject({ state: "down", failures: 2, changedAt: 1_000 });
    expect(applyCheckResult(stillDown, passed(), 3_000)).toMatchObject({
      state: "up",
      changedAt: 3_000,
    });
  });
});

describe("status helpers", () => {
  it("only counts passing checks past the threshold as slow", () => {
    expect(isSlow({ ok: true, latencyMs: 2_001 })).toBe(true);
    expect(isSlow({ ok: true, latencyMs: 2_000 })).toBe(false);
    expect(isSlow({ ok: true, latencyMs: null })).toBe(false);
    expect(isSlow({ ok: false, latencyMs: 5_000 })).toBe(false);
  });

  it("drops internal fields from the public status", () => {
    const status = applyCheckResult(unknownStatus("svc", "k"), passed(12, 204), 9);
    expect(toServiceStatus(status)).toEqual({
      id: "svc",
      state: "up",
      latencyMs: 12,
      statusCode: 204,
      error: null,
      checkedAt: 9,
      changedAt: 9,
    });
  });
});
