import { describe, expect, it } from "vitest";
import {
  serviceStatusesResponseSchema,
  serviceStatusSchema,
  statusHistoryQuerySchema,
  statusHistorySchema,
} from "./status-schemas";

const status = {
  id: "svc",
  state: "down",
  latencyMs: null,
  statusCode: 503,
  error: "HTTP 503",
  checkedAt: 2,
  changedAt: 1,
};

describe("status schemas", () => {
  it("parse statuses and reject unknown states", () => {
    expect(serviceStatusesResponseSchema.parse({ statuses: [status] })).toEqual({
      statuses: [status],
    });
    expect(serviceStatusSchema.safeParse({ ...status, state: "flapping" }).success).toBe(false);
    expect(serviceStatusSchema.safeParse({ ...status, error: undefined }).success).toBe(false);
  });

  it("parse history", () => {
    const history = {
      id: "svc",
      range: "30d",
      resolutionMs: 86_400_000,
      from: 0,
      to: 1,
      uptime: 99.5,
      buckets: [{ ts: 0, checks: 2, failures: 0, slow: 1, latencyMs: 12 }],
    };
    expect(statusHistorySchema.parse(history)).toEqual(history);
    expect(statusHistorySchema.safeParse({ ...history, range: "7d" }).success).toBe(false);
  });

  it("default the history range to 24h and name the allowed ones", () => {
    expect(statusHistoryQuerySchema.parse({})).toEqual({ range: "24h" });
    expect(statusHistoryQuerySchema.parse({ range: "30d" })).toEqual({ range: "30d" });
    const invalid = statusHistoryQuerySchema.safeParse({ range: "1h" });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.message).toBe("range must be one of 24h, 30d");
  });
});
