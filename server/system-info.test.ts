import { describe, expect, it } from "bun:test";
import { systemInfoSchema } from "@shared/host-schemas";
import { app } from "./app";
import { CPUINFO, createFakeHostFs, OS_RELEASE } from "./host/test-fixtures";
import {
  getSystemInfo,
  readCpuModel,
  readHostRootHostname,
  readOsName,
  readUptimeSeconds,
  resolveHostname,
} from "./system-info";

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
    expect(readUptimeSeconds(() => null)).toBeGreaterThanOrEqual(0);
    expect(
      readUptimeSeconds(() => {
        throw new Error("no proc");
      })
    ).toBeGreaterThanOrEqual(0);
  });

  it("reads the host's own hostname only through a host root", () => {
    const files = { "/etc/hostname": "nas\n# trailing\n" };
    expect(readHostRootHostname(createFakeHostFs(files, {}, "/mnt/host"))).toBe("nas");
    expect(readHostRootHostname(createFakeHostFs(files))).toBeNull();
    expect(readHostRootHostname(createFakeHostFs({ "/etc/hostname": "\n" }, {}, "/mnt/host"))).toBe(
      null
    );
    expect(readHostRootHostname(createFakeHostFs({}, {}, "/mnt/host"))).toBeNull();
  });

  it("names the host's OS, but not a container image's", () => {
    expect(readOsName(createFakeHostFs({ "/etc/os-release": OS_RELEASE }), false)).toBe(
      "Debian GNU/Linux 12 (bookworm)"
    );
    expect(readOsName(createFakeHostFs({ "/usr/lib/os-release": "NAME=Arch\n" }), false)).toBe(
      "Arch"
    );
    expect(readOsName(createFakeHostFs({ "/etc/os-release": OS_RELEASE }), true)).toBeNull();
    expect(
      readOsName(createFakeHostFs({ "/etc/os-release": OS_RELEASE }, {}, "/mnt/host"), true)
    ).toBe("Debian GNU/Linux 12 (bookworm)");
    expect(readOsName(createFakeHostFs({}), false)).toBeNull();
  });

  it("reads the CPU model from /proc/cpuinfo, then the runtime", () => {
    const cpus = (model: string) => () => [{ model }];
    expect(readCpuModel(createFakeHostFs({ "/proc/cpuinfo": CPUINFO }), cpus("other"))).toBe(
      "Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz"
    );
    expect(readCpuModel(createFakeHostFs({}), cpus(" Apple M2 "))).toBe("Apple M2");
    expect(
      readCpuModel(createFakeHostFs({ "/proc/cpuinfo": "processor : 0\n" }), cpus("unknown"))
    ).toBeNull();
    expect(readCpuModel(createFakeHostFs({}), () => [])).toBeNull();
  });

  it("describes the mounted host when a host root is set", () => {
    const hostFs = createFakeHostFs(
      {
        "/etc/hostname": "nas\n",
        "/etc/os-release": OS_RELEASE,
        "/proc/cpuinfo": CPUINFO,
        "/proc/uptime": "90061.5 1000.0\n",
      },
      {},
      "/mnt/host"
    );
    const info = getSystemInfo(hostFs, true);

    expect(systemInfoSchema.parse(info)).toEqual(info);
    expect(info).toMatchObject({
      cpuModel: "Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz",
      hostname: process.env.ORBITDASH_HOSTNAME?.trim() || "nas",
      osName: "Debian GNU/Linux 12 (bookworm)",
      platform: process.platform,
      uptimeSeconds: 90061,
    });
  });

  it("serves GET /api/system", async () => {
    const response = await app.request("/api/system");
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(systemInfoSchema.safeParse(body).success).toBe(true);
  });
});
