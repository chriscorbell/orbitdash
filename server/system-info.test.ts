import { describe, expect, it } from "bun:test";
import { app } from "./app";
import { readUptimeSeconds, resolveHostname } from "./system-info";

describe("system info", () => {
  it("prefers ORBITDASH_HOSTNAME", () => {
    expect(resolveHostname({ ORBITDASH_HOSTNAME: " cloud " }, "abc", true)).toBe("cloud");
  });

  it("hides Docker's container-id hostname but keeps real names", () => {
    expect(resolveHostname({}, "3f2a9c1b7d4e", true)).toBeNull();
    expect(resolveHostname({}, "3f2a9c1b7d4e", false)).toBe("3f2a9c1b7d4e");
    expect(resolveHostname({}, "nas", true)).toBe("nas");
    expect(resolveHostname({}, "", false)).toBeNull();
  });

  it("reads host uptime from /proc and falls back to the process view", () => {
    expect(readUptimeSeconds(() => "12345.67 999.00\n")).toBe(12345);
    expect(readUptimeSeconds(() => "garbage")).toBeGreaterThanOrEqual(0);
    expect(
      readUptimeSeconds(() => {
        throw new Error("no proc");
      })
    ).toBeGreaterThanOrEqual(0);
  });

  it("serves GET /api/system", async () => {
    const response = await app.request("/api/system");
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(typeof body.cpuCount).toBe("number");
    expect(typeof body.platform).toBe("string");
  });
});
