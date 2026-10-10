import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { createHostFs, getHostFs, normalizeHostRoot, toHostPath } from "./host-fs";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-host-root-"));
  fs.mkdirSync(path.join(root, "proc", "1", "net"), { recursive: true });
  fs.writeFileSync(path.join(root, "proc", "stat"), "cpu 1 2 3 4\n");
  fs.writeFileSync(path.join(root, "proc", "1", "net", "dev"), "eth0: 1\n");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("host root", () => {
  it("normalizes ORBITDASH_HOST_ROOT, treating unset, blank and / as no root", () => {
    expect(normalizeHostRoot(undefined)).toBe("");
    expect(normalizeHostRoot("  ")).toBe("");
    expect(normalizeHostRoot("/")).toBe("");
    expect(normalizeHostRoot("/mnt/host/")).toBe("/mnt/host");
    expect(normalizeHostRoot(" /mnt/host ")).toBe("/mnt/host");
  });

  it("takes configured paths as host paths, with or without the root in front", () => {
    expect(toHostPath("", "/srv")).toBe("/srv");
    expect(toHostPath("/mnt/host", "/srv")).toBe("/srv");
    expect(toHostPath("/mnt/host", "/mnt/host/srv")).toBe("/srv");
    expect(toHostPath("/mnt/host", "/mnt/host")).toBe("/");
    expect(toHostPath("/mnt/host", "/mnt/hostess")).toBe("/mnt/hostess");
  });
});

describe("createHostFs", () => {
  it("reads, lists and statfs's host paths under the root", () => {
    const hostFs = createHostFs(root);
    expect(hostFs.root).toBe(root);
    expect(hostFs.read("/proc/stat")).toBe("cpu 1 2 3 4\n");
    expect(hostFs.read("/proc/1/net/dev")).toBe("eth0: 1\n");
    expect(hostFs.list("/proc").sort()).toEqual(["1", "stat"]);

    const stats = hostFs.statfs("/");
    expect(stats?.blocks).toBeGreaterThan(0);
    expect(stats?.bsize).toBeGreaterThan(0);
    expect(stats!.bavail).toBeLessThanOrEqual(stats!.bfree);
  });

  it("returns null or nothing for what it can't read, instead of throwing", () => {
    const hostFs = createHostFs(root);
    expect(hostFs.read("/proc/meminfo")).toBeNull();
    expect(hostFs.read("/proc")).toBeNull();
    expect(hostFs.list("/sys/class/hwmon")).toEqual([]);
    expect(hostFs.statfs("/does/not/exist")).toBeNull();
  });

  it("reads this machine's own paths without a root", () => {
    const hostFs = createHostFs("");
    expect(hostFs.read(path.join(root, "proc", "stat"))).toBe("cpu 1 2 3 4\n");
    expect(getHostFs()).toBe(getHostFs());
  });
});
