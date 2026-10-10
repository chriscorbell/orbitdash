import { describe, expect, it } from "vitest";
import { HOST_SNAPSHOT_VERSION, hostSnapshotSchema, systemInfoSchema } from "./host-schemas";
import type { HostSnapshot, SystemInfo } from "./types";

const hostSnapshot: HostSnapshot = {
  version: 1,
  ts: 1_700_000_000_000,
  intervalMs: 1_000,
  cpu: {
    usage: 12.5,
    cores: [
      { id: 0, usage: 20, frequencyMhz: 3400 },
      { id: 1, usage: null, frequencyMhz: null },
    ],
    load: { one: 0.5, five: 0.4, fifteen: 0.3 },
    frequencyMhz: 3400,
    temperatureCelsius: 52,
  },
  memory: {
    totalBytes: 16e9,
    usedBytes: 6e9,
    availableBytes: 10e9,
    cachedBytes: 7e9,
    swapTotalBytes: null,
    swapUsedBytes: null,
  },
  temperatures: [{ id: "hwmon2/temp1", chip: "coretemp", label: "Package id 0", celsius: 52 }],
  filesystems: [
    {
      mountpoint: "/",
      device: "/dev/nvme0n1p2",
      type: "ext4",
      totalBytes: 500e9,
      usedBytes: 100e9,
      availableBytes: 400e9,
    },
  ],
  disks: [{ name: "nvme0n1", readBytesPerSec: 1024, writeBytesPerSec: null }],
  network: [{ name: "eth0", rxBytesPerSec: 125_000, txBytesPerSec: 25_000 }],
};

const systemInfo: SystemInfo = {
  cpuCount: 8,
  cpuModel: "Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz",
  hostname: "nas",
  kernel: "6.8.0-45-generic",
  osName: "Ubuntu 24.04.1 LTS",
  platform: "linux",
  uptimeSeconds: 90_061,
};

describe("host snapshot schema", () => {
  it("accepts a full snapshot and one from a machine it could barely read", () => {
    expect(hostSnapshotSchema.parse(hostSnapshot)).toEqual(hostSnapshot);
    const sparse: HostSnapshot = {
      ...hostSnapshot,
      intervalMs: null,
      cpu: { usage: null, cores: [], load: null, frequencyMhz: null, temperatureCelsius: null },
      memory: null,
      temperatures: [],
      filesystems: [],
      disks: [],
      network: [],
    };
    expect(hostSnapshotSchema.parse(sparse)).toEqual(sparse);
  });

  it("rejects other versions and malformed sections", () => {
    expect(HOST_SNAPSHOT_VERSION).toBe(1);
    expect(hostSnapshotSchema.safeParse({ ...hostSnapshot, version: 2 }).success).toBe(false);
    expect(
      hostSnapshotSchema.safeParse({ ...hostSnapshot, network: [{ name: "eth0" }] }).success
    ).toBe(false);
    expect(hostSnapshotSchema.safeParse({ ...hostSnapshot, memory: undefined }).success).toBe(
      false
    );
  });
});

describe("system info schema", () => {
  it("accepts the host facts, with what couldn't be read as null", () => {
    expect(systemInfoSchema.parse(systemInfo)).toEqual(systemInfo);
    const sparse = { ...systemInfo, cpuModel: null, hostname: null, kernel: null, osName: null };
    expect(systemInfoSchema.parse(sparse)).toEqual(sparse);
    expect(systemInfoSchema.safeParse({ ...systemInfo, osName: undefined }).success).toBe(false);
  });
});
