import { describe, expect, it } from "bun:test";
import { hostSnapshotSchema } from "@shared/host-schemas";
import {
  createHostCollector,
  diskUsagePercent,
  nodeOsFacts,
  toMetricSample,
  type OsFacts,
} from "./collector";
import {
  createFakeHostFs,
  DISKSTATS_SECOND,
  linuxHostFiles,
  NET_DEV_SECOND,
  PROC_STAT_SECOND,
  STATFS,
} from "./test-fixtures";

/** OS facts that fail loudly if the collector reaches for them while /proc is readable. */
const unusedOsFacts: OsFacts = {
  cpus: () => {
    throw new Error("cpus() should not be needed");
  },
  freemem: () => 0,
  loadavg: () => [0, 0, 0],
  platform: "linux",
  totalmem: () => 0,
  vmStat: () => null,
};

function linuxCollector() {
  const fs = createFakeHostFs(linuxHostFiles(), STATFS);
  return { collector: createHostCollector({ fs, osFacts: unusedOsFacts }), fs };
}

function cpuTimes(user: number, idle: number) {
  return { times: { user, nice: 0, sys: 0, idle, irq: 0 } };
}

describe("host collector on Linux", () => {
  it("reads everything on the first snapshot, with rates still unknown", () => {
    const { collector } = linuxCollector();
    const snapshot = collector.collect(1_000);

    expect(hostSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({ version: 1, ts: 1_000, intervalMs: null });
    expect(snapshot.cpu).toEqual({
      usage: null,
      cores: [
        { id: 0, usage: null, frequencyMhz: 3400 },
        { id: 1, usage: null, frequencyMhz: 800 },
      ],
      load: { one: 0.52, five: 0.58, fifteen: 0.59 },
      frequencyMhz: 2100,
      temperatureCelsius: 52,
    });
    expect(snapshot.memory?.usedBytes).toBe(6_000_000 * 1024);
    expect(snapshot.temperatures.map((sensor) => sensor.chip)).toEqual([
      "coretemp",
      "coretemp",
      "coretemp",
      "coretemp",
      "nvme",
      "acpitz",
    ]);
    expect(snapshot.filesystems).toEqual([
      {
        mountpoint: "/",
        device: "/dev/nvme0n1p2",
        type: "ext4",
        totalBytes: 1000 * 4096,
        usedBytes: 600 * 4096,
        availableBytes: 400 * 4096,
      },
      {
        mountpoint: "/boot/efi",
        device: "/dev/nvme0n1p1",
        type: "vfat",
        totalBytes: 100 * 4096,
        usedBytes: 10 * 4096,
        availableBytes: 90 * 4096,
      },
      {
        mountpoint: "/srv/media",
        device: "/dev/sda1",
        type: "ext4",
        totalBytes: 5000 * 4096,
        usedBytes: 4000 * 4096,
        availableBytes: 1000 * 4096,
      },
    ]);
    expect(snapshot.disks).toEqual([
      { name: "nvme0n1", readBytesPerSec: null, writeBytesPerSec: null },
      { name: "sda", readBytesPerSec: null, writeBytesPerSec: null },
    ]);
    expect(snapshot.network).toEqual([{ name: "eth0", rxBytesPerSec: null, txBytesPerSec: null }]);
  });

  it("turns counter deltas into usage and rates, and handles resets and new devices", () => {
    const { collector, fs } = linuxCollector();
    collector.collect(1_000);
    fs.files["/proc/stat"] = PROC_STAT_SECOND;
    fs.files["/proc/diskstats"] = DISKSTATS_SECOND;
    fs.files["/proc/1/net/dev"] = NET_DEV_SECOND;

    const snapshot = collector.collect(2_000);

    expect(snapshot.intervalMs).toBe(1_000);
    expect(snapshot.cpu.usage).toBe(37.5);
    expect(snapshot.cpu.cores.map((core) => core.usage)).toEqual([50, 25]);
    expect(snapshot.disks).toEqual([
      { name: "nvme0n1", readBytesPerSec: 1_048_576, writeBytesPerSec: 2_097_152 },
      // sda's counters went backwards (re-created), so its read rate is unknown for this tick.
      { name: "sda", readBytesPerSec: null, writeBytesPerSec: 0 },
    ]);
    expect(snapshot.network).toEqual([
      { name: "eth0", rxBytesPerSec: 125_000, txBytesPerSec: 25_000 },
      { name: "wg0", rxBytesPerSec: null, txBytesPerSec: null },
    ]);
  });

  it("gives up on rates when the clock goes backwards, then recovers", () => {
    const { collector, fs } = linuxCollector();
    collector.collect(5_000);
    fs.files["/proc/stat"] = PROC_STAT_SECOND;

    const backwards = collector.collect(4_000);
    expect(backwards.intervalMs).toBeNull();
    expect(backwards.cpu.usage).toBeNull();
    expect(collector.collect(5_000).intervalMs).toBe(1_000);
  });

  it("re-reads temperatures at most every interval", () => {
    const fs = createFakeHostFs(linuxHostFiles(), STATFS);
    const collector = createHostCollector({
      fs,
      osFacts: unusedOsFacts,
      temperatureIntervalMs: 5_000,
    });
    collector.collect(0);
    fs.files["/sys/class/hwmon/hwmon2/temp1_input"] = "80000\n";

    expect(collector.collect(4_999).cpu.temperatureCelsius).toBe(52);
    expect(collector.collect(5_000).cpu.temperatureCelsius).toBe(80);
    fs.files["/sys/class/hwmon/hwmon2/temp1_input"] = "60000\n";
    // A clock that jumps backwards forces a fresh read rather than trusting the cache.
    expect(collector.collect(1_000).cpu.temperatureCelsius).toBe(60);
  });

  it("reads our own mounts and network namespace when PID 1's aren't readable", () => {
    const files = linuxHostFiles();
    files["/proc/self/mounts"] = files["/proc/1/mounts"];
    files["/proc/net/dev"] = files["/proc/1/net/dev"];
    delete files["/proc/1/mounts"];
    delete files["/proc/1/net/dev"];
    const collector = createHostCollector({
      fs: createFakeHostFs(files, STATFS),
      osFacts: unusedOsFacts,
    });

    const snapshot = collector.collect(1_000);
    expect(snapshot.filesystems).toHaveLength(3);
    expect(snapshot.network.map((entry) => entry.name)).toEqual(["eth0"]);
  });

  it("leaves out filesystems statfs can't read or that report no blocks", () => {
    const fs = createFakeHostFs(linuxHostFiles(), {
      "/": STATFS["/"],
      "/boot/efi": { blocks: 0, bsize: 4096, bavail: 0, bfree: 0 },
    });
    const snapshot = createHostCollector({ fs, osFacts: unusedOsFacts }).collect(1_000);
    expect(snapshot.filesystems.map((entry) => entry.mountpoint)).toEqual(["/"]);
  });
});

describe("host collector without /proc", () => {
  it("falls back to the runtime's CPU, load and memory figures and omits the rest", () => {
    let calls = 0;
    const osFacts: OsFacts = {
      cpus: () => {
        calls += 1;
        return calls === 1
          ? [cpuTimes(100, 900), cpuTimes(200, 800)]
          : [cpuTimes(150, 950), cpuTimes(300, 800)];
      },
      freemem: () => 1_000,
      loadavg: () => [1.5, 1.25, 1],
      platform: "darwin",
      totalmem: () => 8_000,
      vmStat: () => "Mach Virtual Memory Statistics: (page size of 1000 bytes)\nPages free: 2.\n",
    };
    const collector = createHostCollector({ fs: createFakeHostFs({}), osFacts });

    const first = collector.collect(1_000);
    expect(hostSnapshotSchema.parse(first)).toEqual(first);
    expect(first.cpu).toEqual({
      usage: null,
      cores: [
        { id: 0, usage: null, frequencyMhz: null },
        { id: 1, usage: null, frequencyMhz: null },
      ],
      load: { one: 1.5, five: 1.25, fifteen: 1 },
      frequencyMhz: null,
      temperatureCelsius: null,
    });
    expect(first.memory).toEqual({
      totalBytes: 8_000,
      usedBytes: 6_000,
      availableBytes: 2_000,
      cachedBytes: null,
      swapTotalBytes: null,
      swapUsedBytes: null,
    });
    expect(first.temperatures).toEqual([]);
    expect(first.filesystems).toEqual([]);
    expect(first.disks).toEqual([]);
    expect(first.network).toEqual([]);

    const second = collector.collect(2_000);
    expect(second.cpu.cores.map((core) => core.usage)).toEqual([50, 100]);
    expect(second.cpu.usage).toBe(75);
  });

  it("uses free memory where vm_stat isn't available, and reports nothing it can't measure", () => {
    const osFacts: OsFacts = {
      cpus: () => [],
      freemem: () => 9_999,
      loadavg: () => [0, 0, 0],
      platform: "win32",
      totalmem: () => 4_000,
      vmStat: () => {
        throw new Error("vm_stat only runs on macOS");
      },
    };
    const snapshot = createHostCollector({ fs: createFakeHostFs({}), osFacts }).collect(1_000);

    expect(snapshot.cpu).toEqual({
      usage: null,
      cores: [],
      load: null,
      frequencyMhz: null,
      temperatureCelsius: null,
    });
    expect(snapshot.memory).toMatchObject({ availableBytes: 4_000, usedBytes: 0 });

    const noMemory = createHostCollector({
      fs: createFakeHostFs({}),
      osFacts: { ...osFacts, platform: "linux", totalmem: () => 0, loadavg: () => [Number.NaN] },
    }).collect(1_000);
    expect(noMemory.memory).toBeNull();
    expect(noMemory.cpu.load).toBeNull();
  });

  it("asks the real runtime for its facts by default", () => {
    expect(nodeOsFacts.cpus().length).toBeGreaterThan(0);
    expect(nodeOsFacts.totalmem()).toBeGreaterThan(0);
    expect(nodeOsFacts.freemem()).toBeGreaterThan(0);
    expect(nodeOsFacts.loadavg()).toHaveLength(3);
    expect(nodeOsFacts.platform).toBe(process.platform);
    const vmStat = nodeOsFacts.vmStat();
    expect(vmStat === null || vmStat.includes("Pages free")).toBe(true);
  });
});

describe("metric sample", () => {
  it("derives the strip's percentages from the snapshot", () => {
    const { collector, fs } = linuxCollector();
    collector.collect(1_000);
    fs.files["/proc/stat"] = PROC_STAT_SECOND;
    const snapshot = collector.collect(2_000);

    expect(toMetricSample(snapshot, 42.5)).toEqual({ ts: 2_000, cpu: 37.5, ram: 37.5, disk: 42.5 });
  });

  it("reports zero for what it couldn't read, as the strip always has", () => {
    const snapshot = createHostCollector({
      fs: createFakeHostFs({}),
      osFacts: { ...unusedOsFacts, cpus: () => [] },
    }).collect(1_000);
    expect(toMetricSample(snapshot, 0)).toEqual({ ts: 1_000, cpu: 0, ram: 0, disk: 0 });
  });

  it("computes disk use like df, counting reserved blocks as used", () => {
    expect(diskUsagePercent({ blocks: 1000, bsize: 4096, bavail: 400, bfree: 450 })).toBe(60);
    expect(diskUsagePercent({ blocks: 3, bsize: 4096, bavail: 2, bfree: 2 })).toBe(33.33);
    expect(diskUsagePercent({ blocks: 0, bsize: 4096, bavail: 0, bfree: 0 })).toBe(0);
    expect(diskUsagePercent(null)).toBe(0);
  });
});
