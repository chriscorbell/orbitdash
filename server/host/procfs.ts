import type { HostLoadAverage, HostMemory } from "@shared/types";

/**
 * Pure parsers for /proc and /etc files, plus the filters that decide which filesystems, disks
 * and network interfaces count as "real". Every function takes file contents and returns plain
 * data, null or an empty list for input it doesn't recognize; none of them read files.
 */

/** Cumulative CPU time in jiffies; usage is the share of a delta that wasn't idle. */
export interface CpuTimes {
  idle: number;
  total: number;
}

export interface ProcStat {
  cores: Array<{ id: number; times: CpuTimes }>;
  total: CpuTimes;
}

export interface MountEntry {
  device: string;
  mountpoint: string;
  type: string;
}

export interface DiskCounters {
  name: string;
  readsCompleted: number;
  sectorsRead: number;
  sectorsWritten: number;
  writesCompleted: number;
}

export interface InterfaceCounters {
  name: string;
  rxBytes: number;
  txBytes: number;
}

/** /proc/diskstats counts 512-byte sectors regardless of the device's real sector size. */
export const DISKSTATS_SECTOR_BYTES = 512;

/**
 * One cpu line's fields: user nice system idle iowait irq softirq steal [guest guest_nice]. Guest
 * time is already included in user and nice, so it stays out of the total.
 */
export function parseCpuTimes(fields: number[]): CpuTimes | null {
  const counted = fields.slice(0, 8);
  if (counted.length < 4 || counted.some((value) => !Number.isFinite(value))) return null;
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = counted;
  return {
    idle: idle + iowait,
    total: user + nice + system + idle + iowait + irq + softirq + steal,
  };
}

/** The aggregate `cpu` line and every `cpuN` line of /proc/stat, cores sorted by N. */
export function parseProcStat(text: string): ProcStat | null {
  let total: CpuTimes | null = null;
  const cores: ProcStat["cores"] = [];

  for (const line of text.split("\n")) {
    const match = /^cpu(\d*)\s+(.+)$/.exec(line);
    if (!match) continue;
    const times = parseCpuTimes(match[2].trim().split(/\s+/).map(Number));
    if (!times) continue;
    if (match[1] === "") {
      total = times;
    } else {
      cores.push({ id: Number(match[1]), times });
    }
  }

  return total ? { cores: cores.sort((left, right) => left.id - right.id), total } : null;
}

export function parseLoadavg(text: string): HostLoadAverage | null {
  const [one, five, fifteen] = text.trim().split(/\s+/).slice(0, 3).map(Number);
  if (![one, five, fifteen].every(Number.isFinite)) return null;
  return { one, five, fifteen };
}

/** /proc/meminfo in bytes. "Used" is total minus available, as free, htop and btop report it. */
export function parseMeminfo(text: string): HostMemory | null {
  const bytes = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = /^([\w()]+):\s+(\d+)/.exec(line);
    if (match) bytes.set(match[1], Number(match[2]) * 1024);
  }

  const total = bytes.get("MemTotal");
  if (!total) return null;

  const hasCache = bytes.has("Cached");
  const cached =
    (bytes.get("Buffers") ?? 0) + (bytes.get("Cached") ?? 0) + (bytes.get("SReclaimable") ?? 0);
  // MemAvailable exists since Linux 3.14; before that, free plus reclaimable cache is the estimate.
  const available = Math.min(
    total,
    bytes.get("MemAvailable") ?? (bytes.get("MemFree") ?? 0) + cached
  );
  const swapTotal = bytes.get("SwapTotal");
  const swapFree = bytes.get("SwapFree");

  return {
    totalBytes: total,
    usedBytes: total - available,
    availableBytes: available,
    cachedBytes: hasCache ? cached : null,
    swapTotalBytes: swapTotal ?? null,
    swapUsedBytes:
      swapTotal !== undefined && swapFree !== undefined ? Math.max(0, swapTotal - swapFree) : null,
  };
}

/** The kernel writes spaces, tabs, newlines and backslashes in mount fields as octal escapes. */
function unescapeMountField(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  );
}

/** /proc/<pid>/mounts: device, mountpoint and filesystem type of every mount. */
export function parseMounts(text: string): MountEntry[] {
  return text.split("\n").flatMap((line) => {
    const [device, mountpoint, type] = line.trim().split(/\s+/);
    if (!device || !mountpoint || !type) return [];
    return [
      { device: unescapeMountField(device), mountpoint: unescapeMountField(mountpoint), type },
    ];
  });
}

/** Kernel, memory-backed, layered and network filesystems: none of them is a local disk. */
const VIRTUAL_FS_TYPES = new Set([
  "9p",
  "afs",
  "aufs",
  "autofs",
  "binfmt_misc",
  "bpf",
  "ceph",
  "cgroup",
  "cgroup2",
  "cifs",
  "configfs",
  "debugfs",
  "devpts",
  "devtmpfs",
  "ecryptfs",
  "efivarfs",
  "fusectl",
  "glusterfs",
  "hugetlbfs",
  "iso9660",
  "mqueue",
  "nfs",
  "nfs4",
  "nfsd",
  "nsfs",
  "overlay",
  "proc",
  "pstore",
  "ramfs",
  "rootfs",
  "rpc_pipefs",
  "securityfs",
  "selinuxfs",
  "shiftfs",
  "smb3",
  "smbfs",
  "squashfs",
  "sysfs",
  "tmpfs",
  "tracefs",
  "udf",
  "virtiofs",
]);

/** FUSE is mostly virtual or remote (portals, sshfs, rclone); these two pool local disks. */
const LOCAL_FUSE_TYPES = new Set(["fuse.mergerfs", "fuse.shfs"]);

/** Container runtimes and snaps mount many layers under these; /proc, /sys and /dev aren't disks. */
const SKIPPED_MOUNT_PREFIXES = [
  "/dev",
  "/proc",
  "/snap",
  "/sys",
  "/var/lib/containers",
  "/var/lib/docker",
  "/var/lib/kubelet",
];

/** Files Docker bind-mounts into every container; they'd show up as the disk Docker lives on. */
const SKIPPED_MOUNTPOINTS = new Set(["/etc/hostname", "/etc/hosts", "/etc/resolv.conf"]);

export function isRealFilesystem({ mountpoint, type }: MountEntry): boolean {
  const isFuse = type === "fuse" || type.startsWith("fuse.");
  if (isFuse ? !LOCAL_FUSE_TYPES.has(type) : VIRTUAL_FS_TYPES.has(type)) return false;
  if (SKIPPED_MOUNTPOINTS.has(mountpoint)) return false;
  return !SKIPPED_MOUNT_PREFIXES.some(
    (prefix) => mountpoint === prefix || mountpoint.startsWith(`${prefix}/`)
  );
}

/**
 * Real filesystems, once each: bind mounts and btrfs subvolumes of the same device share its
 * space, so only the shortest mountpoint is kept. Sorted by mountpoint.
 */
export function selectFilesystems(mounts: MountEntry[]): MountEntry[] {
  const byDevice = new Map<string, MountEntry>();
  for (const mount of mounts) {
    if (!isRealFilesystem(mount)) continue;
    const kept = byDevice.get(mount.device);
    if (!kept || mount.mountpoint.length < kept.mountpoint.length) {
      byDevice.set(mount.device, mount);
    }
  }
  return [...byDevice.values()].sort((left, right) =>
    left.mountpoint.localeCompare(right.mountpoint)
  );
}

/** /proc/diskstats: major minor name reads merged sectors ms writes merged sectors ms ... */
export function parseDiskstats(text: string): DiskCounters[] {
  return text.split("\n").flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10) return [];
    const [readsCompleted, sectorsRead, writesCompleted, sectorsWritten] = [3, 5, 7, 9].map(
      (index) => Number(fields[index])
    );
    if (![readsCompleted, sectorsRead, writesCompleted, sectorsWritten].every(Number.isFinite)) {
      return [];
    }
    return [{ name: fields[2], readsCompleted, sectorsRead, writesCompleted, sectorsWritten }];
  });
}

/**
 * Not physical disks: loop, RAM and swap devices, floppies and optical drives, network block
 * devices, eMMC boot areas, and device-mapper and md arrays, whose I/O is already counted on
 * their member disks.
 */
const VIRTUAL_DISK = /^(loop|ram|zram|fd|sr|nbd|dm-|md)\d|^mmcblk\d+(boot\d+|rpmb)$/;

/** sda1 belongs to sda; nvme0n1p1, mmcblk0p1 and md0p1 add a "p" because the disk ends in a digit. */
function isPartition(name: string, names: ReadonlySet<string>): boolean {
  const match = /^(.+?)\d+$/.exec(name);
  if (!match) return false;
  const base = match[1];
  const parent = /\dp$/.test(base) ? base.slice(0, -1) : base;
  return names.has(parent);
}

/** Whole physical disks that have done any I/O, skipping partitions when their disk is listed. */
export function selectWholeDisks(disks: DiskCounters[]): DiskCounters[] {
  const names = new Set(disks.map((disk) => disk.name));
  return disks.filter(
    (disk) =>
      !VIRTUAL_DISK.test(disk.name) &&
      !isPartition(disk.name, names) &&
      disk.readsCompleted + disk.writesCompleted > 0
  );
}

/** /proc/net/dev: per interface, received bytes is the first field and sent bytes the ninth. */
export function parseNetDev(text: string): InterfaceCounters[] {
  return text.split("\n").flatMap((line) => {
    const colon = line.indexOf(":");
    if (colon === -1) return [];
    const name = line.slice(0, colon).trim();
    const fields = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/)
      .map(Number);
    if (!name || fields.length < 9 || !Number.isFinite(fields[0]) || !Number.isFinite(fields[8])) {
      return [];
    }
    return [{ name, rxBytes: fields[0], txBytes: fields[8] }];
  });
}

/**
 * Loopback, container and VM plumbing (veth pairs, Docker and libvirt bridges, CNI overlays,
 * Proxmox tap and firewall devices): their traffic is counted again on a real interface.
 */
const VIRTUAL_INTERFACE =
  /^(veth|docker|br-|virbr|vnet|cni|flannel|cali|vxlan|kube-|tunl|weave|ifb|dummy|lxcbr|lxdbr|podman|cilium|tap|fwbr|fwpr|fwln)/;

export function isPhysicalInterface(name: string): boolean {
  return name !== "lo" && !VIRTUAL_INTERFACE.test(name);
}

/** PRETTY_NAME from os-release, or NAME and VERSION when it's missing. */
export function parseOsRelease(text: string): string | null {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const unquoted = match[2].replace(/^(["'])(.*)\1$/, "$2").replace(/\\(.)/g, "$1");
    values.set(match[1], unquoted.trim());
  }
  const pretty = values.get("PRETTY_NAME");
  if (pretty) return pretty;
  const fallback = [values.get("NAME"), values.get("VERSION")].filter(Boolean).join(" ");
  return fallback || null;
}

function cpuinfoFields(text: string): Array<[string, string]> {
  return text.split("\n").flatMap((line): Array<[string, string]> => {
    const colon = line.indexOf(":");
    return colon === -1 ? [] : [[line.slice(0, colon).trim(), line.slice(colon + 1).trim()]];
  });
}

/** The CPU's marketing name from /proc/cpuinfo ("model name" on x86, "Processor" on older ARM). */
export function parseCpuModel(text: string): string | null {
  const fields = cpuinfoFields(text);
  for (const key of ["model name", "Processor"]) {
    const value = fields.find(([name, entry]) => name === key && entry)?.[1];
    if (value) return value.replace(/\s+/g, " ");
  }
  return null;
}

/** "cpu MHz" per processor number from /proc/cpuinfo, for machines without cpufreq. */
export function parseCpuinfoMhz(text: string): Map<number, number> {
  const mhzByProcessor = new Map<number, number>();
  let processor: number | null = null;
  for (const [key, value] of cpuinfoFields(text)) {
    if (key === "processor") {
      processor = Number.isInteger(Number(value)) ? Number(value) : null;
    } else if (key === "cpu MHz" && processor !== null) {
      const mhz = Number(value);
      if (Number.isFinite(mhz) && mhz > 0) mhzByProcessor.set(processor, Math.round(mhz));
    }
  }
  return mhzByProcessor;
}

/**
 * Available memory from macOS `vm_stat`: free, inactive, speculative and purgeable pages, the
 * same pages Activity Monitor and btop treat as available.
 */
export function parseVmStatAvailable(text: string): number | null {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 4096);
  const pages = (key: string) => {
    const match = new RegExp(`${key}:\\s+(\\d+)\\.`).exec(text);
    return match ? Number(match[1]) : null;
  };
  const free = pages("Pages free");
  if (free === null) return null;
  const others = ["Pages inactive", "Pages speculative", "Pages purgeable"].map(
    (key) => pages(key) ?? 0
  );
  return (free + others.reduce((sum, value) => sum + value, 0)) * pageSize;
}
