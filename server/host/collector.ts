import { execFileSync } from "child_process";
import os from "os";
import { HOST_SNAPSHOT_VERSION } from "@shared/host-schemas";
import type {
  HostCpu,
  HostDiskIo,
  HostFilesystem,
  HostLoadAverage,
  HostMemory,
  HostNetworkInterface,
  HostSnapshot,
  HostTemperature,
  MetricSample,
} from "@shared/types";
import type { HostFs, StatfsResult } from "./host-fs";
import {
  DISKSTATS_SECTOR_BYTES,
  isPhysicalInterface,
  parseDiskstats,
  parseLoadavg,
  parseMeminfo,
  parseMounts,
  parseNetDev,
  parseProcStat,
  parseVmStatAvailable,
  selectFilesystems,
  selectWholeDisks,
  type DiskCounters,
  type InterfaceCounters,
  type MountEntry,
  type ProcStat,
} from "./procfs";
import { cpuPercent, perSecond, roundPercent } from "./rates";
import { pickCpuTemperature, readCoreFrequencies, readTemperatures } from "./sysfs";

/** What the collector falls back to where /proc can't be read (macOS, restricted containers). */
export interface OsFacts {
  cpus: () => Array<Pick<os.CpuInfo, "times">>;
  freemem: () => number;
  loadavg: () => number[];
  platform: NodeJS.Platform;
  totalmem: () => number;
  /** macOS `vm_stat` output; only called on darwin. */
  vmStat: () => string | null;
}

export const nodeOsFacts: OsFacts = {
  cpus: () => os.cpus(),
  freemem: () => os.freemem(),
  loadavg: () => os.loadavg(),
  platform: process.platform,
  totalmem: () => os.totalmem(),
  vmStat: () => {
    try {
      return execFileSync("vm_stat", { encoding: "utf-8" });
    } catch {
      return null;
    }
  },
};

/** Counters a snapshot keeps so the next one can turn them into rates. */
interface Reading {
  cpu: ProcStat | null;
  disks: Map<string, DiskCounters>;
  network: Map<string, InterfaceCounters>;
  ts: number;
}

export interface HostCollector {
  collect: (now: number) => HostSnapshot;
}

/** os.cpus() times in milliseconds, shaped like /proc/stat so the same delta math applies. */
function cpuCountersFromOs(cpus: Array<Pick<os.CpuInfo, "times">>): ProcStat | null {
  if (cpus.length === 0) return null;
  const cores = cpus.map(({ times }, id) => ({
    id,
    times: {
      idle: times.idle,
      total: times.user + times.nice + times.sys + times.idle + times.irq,
    },
  }));
  const total = cores.reduce(
    (sum, core) => ({ idle: sum.idle + core.times.idle, total: sum.total + core.times.total }),
    { idle: 0, total: 0 }
  );
  return { cores, total };
}

function readCpu(fs: HostFs, osFacts: OsFacts, previous: ProcStat | null) {
  const procStat = fs.read("/proc/stat");
  const counters = (procStat ? parseProcStat(procStat) : null) ?? cpuCountersFromOs(osFacts.cpus());
  const previousCores = new Map(previous?.cores.map((core) => [core.id, core.times]));
  const frequencies = readCoreFrequencies(fs, counters?.cores.map((core) => core.id) ?? []);

  const cores = (counters?.cores ?? []).map((core) => ({
    id: core.id,
    usage: cpuPercent(core.times, previousCores.get(core.id)),
    frequencyMhz: frequencies.get(core.id) ?? null,
  }));
  const knownMhz = cores.flatMap((core) => (core.frequencyMhz === null ? [] : [core.frequencyMhz]));

  return {
    counters,
    cores,
    frequencyMhz:
      knownMhz.length > 0
        ? Math.round(knownMhz.reduce((sum, mhz) => sum + mhz, 0) / knownMhz.length)
        : null,
    usage: counters && previous ? cpuPercent(counters.total, previous.total) : null,
  };
}

function readLoad(fs: HostFs, osFacts: OsFacts): HostLoadAverage | null {
  const loadavg = fs.read("/proc/loadavg");
  const parsed = loadavg ? parseLoadavg(loadavg) : null;
  if (parsed || osFacts.platform === "win32") return parsed;
  const [one, five, fifteen] = osFacts.loadavg();
  return [one, five, fifteen].every(Number.isFinite) ? { one, five, fifteen } : null;
}

function readMemory(fs: HostFs, osFacts: OsFacts): HostMemory | null {
  const meminfo = fs.read("/proc/meminfo");
  const parsed = meminfo ? parseMeminfo(meminfo) : null;
  if (parsed) return parsed;

  const total = osFacts.totalmem();
  if (!(total > 0)) return null;
  // os.freemem() leaves out reclaimable cache, which overstates use on macOS; vm_stat doesn't.
  const vmStat = osFacts.platform === "darwin" ? osFacts.vmStat() : null;
  const available = Math.min(
    total,
    Math.max(0, (vmStat ? parseVmStatAvailable(vmStat) : null) ?? osFacts.freemem())
  );
  return {
    totalBytes: total,
    usedBytes: total - available,
    availableBytes: available,
    cachedBytes: null,
    swapTotalBytes: null,
    swapUsedBytes: null,
  };
}

function toFilesystem(mount: MountEntry, stats: StatfsResult): HostFilesystem {
  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  return {
    mountpoint: mount.mountpoint,
    device: mount.device,
    type: mount.type,
    totalBytes,
    usedBytes: totalBytes - availableBytes,
    availableBytes,
  };
}

/** PID 1's mount table is the host's when a host root is mounted; our own is the fallback. */
function readFilesystems(fs: HostFs): HostFilesystem[] {
  const mounts = fs.read("/proc/1/mounts") ?? fs.read("/proc/self/mounts");
  if (!mounts) return [];
  return selectFilesystems(parseMounts(mounts)).flatMap((mount) => {
    const stats = fs.statfs(mount.mountpoint);
    return stats && stats.blocks > 0 ? [toFilesystem(mount, stats)] : [];
  });
}

function readDisks(fs: HostFs): DiskCounters[] {
  return selectWholeDisks(parseDiskstats(fs.read("/proc/diskstats") ?? ""));
}

/**
 * /proc/net is a link to the reader's own network namespace, so through a host root only PID 1's
 * entry shows the host's interfaces.
 */
function readInterfaces(fs: HostFs): InterfaceCounters[] {
  const netDev = fs.read("/proc/1/net/dev") ?? fs.read("/proc/net/dev") ?? "";
  return parseNetDev(netDev).filter(
    (entry) => isPhysicalInterface(entry.name) && entry.rxBytes + entry.txBytes > 0
  );
}

/**
 * Temperatures move slowly and some sensors are slow to read (an NVMe drive answers each read with
 * a SMART log command), so they're re-read at most this often and reused in between.
 */
export const TEMPERATURE_INTERVAL_MS = 5_000;

/**
 * Reads the host on every collect() and turns cumulative counters into rates against the
 * previous collect(). The first snapshot has no previous reading, so its rates are null.
 */
export function createHostCollector({
  fs,
  osFacts = nodeOsFacts,
  temperatureIntervalMs = TEMPERATURE_INTERVAL_MS,
}: {
  fs: HostFs;
  osFacts?: OsFacts;
  temperatureIntervalMs?: number;
}): HostCollector {
  let previous: Reading | null = null;
  let sensors: { readAt: number; temperatures: HostTemperature[] } | null = null;

  const readSensors = (now: number) => {
    const age = sensors ? now - sensors.readAt : Infinity;
    if (!sensors || age < 0 || age >= temperatureIntervalMs) {
      sensors = { readAt: now, temperatures: readTemperatures(fs) };
    }
    return sensors.temperatures;
  };

  return {
    collect(now) {
      const elapsedMs = previous && now > previous.ts ? now - previous.ts : null;
      const last = elapsedMs === null ? null : previous;

      const cpu = readCpu(fs, osFacts, last?.cpu ?? null);
      const temperatures = readSensors(now);
      const disks = readDisks(fs);
      const interfaces = readInterfaces(fs);

      const diskIo: HostDiskIo[] = disks.map((disk) => {
        const before = last?.disks.get(disk.name);
        return {
          name: disk.name,
          readBytesPerSec: perSecond(
            disk.sectorsRead * DISKSTATS_SECTOR_BYTES,
            before && before.sectorsRead * DISKSTATS_SECTOR_BYTES,
            elapsedMs
          ),
          writeBytesPerSec: perSecond(
            disk.sectorsWritten * DISKSTATS_SECTOR_BYTES,
            before && before.sectorsWritten * DISKSTATS_SECTOR_BYTES,
            elapsedMs
          ),
        };
      });

      const network: HostNetworkInterface[] = interfaces.map((entry) => {
        const before = last?.network.get(entry.name);
        return {
          name: entry.name,
          rxBytesPerSec: perSecond(entry.rxBytes, before?.rxBytes, elapsedMs),
          txBytesPerSec: perSecond(entry.txBytes, before?.txBytes, elapsedMs),
        };
      });

      const cpuSummary: HostCpu = {
        usage: cpu.usage,
        cores: cpu.cores,
        load: readLoad(fs, osFacts),
        frequencyMhz: cpu.frequencyMhz,
        temperatureCelsius: pickCpuTemperature(temperatures),
      };

      previous = {
        cpu: cpu.counters,
        disks: new Map(disks.map((disk) => [disk.name, disk])),
        network: new Map(interfaces.map((entry) => [entry.name, entry])),
        ts: now,
      };

      return {
        version: HOST_SNAPSHOT_VERSION,
        ts: now,
        intervalMs: elapsedMs,
        cpu: cpuSummary,
        memory: readMemory(fs, osFacts),
        temperatures,
        filesystems: readFilesystems(fs),
        disks: diskIo,
        network,
      };
    },
  };
}

/** Disk use of one statfs result, reserved blocks counted as used, as `df` reports it. */
export function diskUsagePercent(stats: StatfsResult | null): number {
  if (!stats || stats.blocks === 0) return 0;
  return roundPercent(((stats.blocks - stats.bavail) / stats.blocks) * 100);
}

/** The strip's three percentages, taken from the same reading as the snapshot. */
export function toMetricSample(snapshot: HostSnapshot, disk: number): MetricSample {
  const { memory } = snapshot;
  return {
    ts: snapshot.ts,
    cpu: snapshot.cpu.usage ?? 0,
    ram: memory ? roundPercent((memory.usedBytes / memory.totalBytes) * 100) : 0,
    disk,
  };
}
