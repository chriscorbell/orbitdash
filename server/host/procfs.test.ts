import { describe, expect, it } from "bun:test";
import {
  isPhysicalInterface,
  isRealFilesystem,
  parseCpuinfoMhz,
  parseCpuModel,
  parseCpuTimes,
  parseDiskstats,
  parseLoadavg,
  parseMeminfo,
  parseMounts,
  parseNetDev,
  parseOsRelease,
  parseProcStat,
  parseVmStatAvailable,
  selectFilesystems,
  selectWholeDisks,
  type DiskCounters,
} from "./procfs";
import {
  CPUINFO,
  DISKSTATS_FIRST,
  LOADAVG,
  MEMINFO,
  MOUNTS,
  NET_DEV_FIRST,
  OS_RELEASE,
  PROC_STAT_FIRST,
} from "./test-fixtures";

describe("/proc/stat", () => {
  it("reads the aggregate line and every core, leaving guest time out of the total", () => {
    expect(parseProcStat(PROC_STAT_FIRST)).toEqual({
      total: { idle: 16400, total: 19600 },
      cores: [
        { id: 0, times: { idle: 8200, total: 9800 } },
        { id: 1, times: { idle: 8200, total: 9800 } },
      ],
    });
  });

  it("sorts cores numerically and accepts old kernels' four-field lines", () => {
    const stat = parseProcStat("cpu 4 0 4 8\ncpu10 1 0 1 2\ncpu2 3 0 3 6\n");
    expect(stat?.cores.map((core) => core.id)).toEqual([2, 10]);
    expect(stat?.total).toEqual({ idle: 8, total: 16 });
  });

  it("skips malformed lines and returns null without an aggregate line", () => {
    expect(parseCpuTimes([1, 2, 3])).toBeNull();
    expect(parseCpuTimes([1, 2, Number.NaN, 4])).toBeNull();
    expect(parseProcStat("cpu0 1 2 3 4\n")).toBeNull();
    expect(parseProcStat("cpu one two three four\ncpu 1 1 1 1\n")?.cores).toEqual([]);
    expect(parseProcStat("")).toBeNull();
  });
});

describe("/proc/loadavg", () => {
  it("reads the three averages", () => {
    expect(parseLoadavg(LOADAVG)).toEqual({ one: 0.52, five: 0.58, fifteen: 0.59 });
  });

  it("returns null for anything else", () => {
    expect(parseLoadavg("")).toBeNull();
    expect(parseLoadavg("0.1 nope 0.3")).toBeNull();
  });
});

describe("/proc/meminfo", () => {
  it("reports bytes, with used as total minus available", () => {
    expect(parseMeminfo(MEMINFO)).toEqual({
      totalBytes: 16_000_000 * 1024,
      usedBytes: 6_000_000 * 1024,
      availableBytes: 10_000_000 * 1024,
      cachedBytes: 7_000_000 * 1024,
      swapTotalBytes: 4_000_000 * 1024,
      swapUsedBytes: 1_000_000 * 1024,
    });
  });

  it("estimates available memory on kernels without MemAvailable", () => {
    const memory = parseMeminfo("MemTotal: 1000 kB\nMemFree: 100 kB\nCached: 300 kB\n");
    expect(memory).toMatchObject({ availableBytes: 400 * 1024, usedBytes: 600 * 1024 });
    expect(memory?.swapTotalBytes).toBeNull();
    expect(memory?.swapUsedBytes).toBeNull();
  });

  it("leaves out what it can't read and never reports more available than total", () => {
    const memory = parseMeminfo("MemTotal: 1000 kB\nMemAvailable: 5000 kB\nSwapTotal: 0 kB\n");
    expect(memory).toMatchObject({ availableBytes: 1000 * 1024, usedBytes: 0, cachedBytes: null });
    expect(memory?.swapTotalBytes).toBe(0);
    expect(memory?.swapUsedBytes).toBeNull();
    expect(parseMeminfo("MemFree: 100 kB\n")).toBeNull();
    expect(parseMeminfo("")).toBeNull();
  });
});

describe("mounts", () => {
  it("parses entries and decodes the kernel's octal escapes", () => {
    const mounts = parseMounts(MOUNTS);
    expect(mounts[0]).toEqual({ device: "/dev/nvme0n1p2", mountpoint: "/", type: "ext4" });
    expect(mounts).toContainEqual({
      device: "/dev/sda1",
      mountpoint: "/mnt/media library",
      type: "ext4",
    });
    expect(parseMounts("\n  \nincomplete\n")).toEqual([]);
  });

  it("keeps local disks and drops virtual, network and container filesystems", () => {
    const real = (type: string, mountpoint = "/data") =>
      isRealFilesystem({ device: "x", mountpoint, type });

    for (const type of ["ext4", "xfs", "btrfs", "zfs", "vfat", "fuseblk", "fuse.mergerfs"]) {
      expect(real(type)).toBe(true);
    }
    for (const type of ["tmpfs", "overlay", "squashfs", "nfs4", "cifs", "proc", "cgroup2"]) {
      expect(real(type)).toBe(false);
    }
    expect(real("fuse.sshfs")).toBe(false);
    expect(real("fuse")).toBe(false);
    expect(real("ext4", "/etc/hosts")).toBe(false);
    expect(real("ext4", "/var/lib/docker/btrfs/subvolumes/abc")).toBe(false);
    expect(real("ext4", "/snap/core22/1380")).toBe(false);
    expect(real("ext4", "/devices")).toBe(true);
  });

  it("lists each device once, under its shortest mountpoint, sorted", () => {
    expect(selectFilesystems(parseMounts(MOUNTS))).toEqual([
      { device: "/dev/nvme0n1p2", mountpoint: "/", type: "ext4" },
      { device: "/dev/nvme0n1p1", mountpoint: "/boot/efi", type: "vfat" },
      { device: "/dev/sda1", mountpoint: "/srv/media", type: "ext4" },
    ]);
  });

  it("keeps a container's data volume and hides the files Docker bind-mounts", () => {
    const container = `overlay / overlay rw 0 0
/dev/sda1 /etc/resolv.conf ext4 rw 0 0
/dev/sda1 /etc/hostname ext4 rw 0 0
/dev/sda1 /etc/hosts ext4 rw 0 0
/dev/sdb1 /data ext4 rw 0 0
`;
    expect(selectFilesystems(parseMounts(container))).toEqual([
      { device: "/dev/sdb1", mountpoint: "/data", type: "ext4" },
    ]);
  });
});

describe("/proc/diskstats", () => {
  it("parses I/O counters and skips short or malformed lines", () => {
    const disks = parseDiskstats(DISKSTATS_FIRST);
    expect(disks).toHaveLength(8);
    expect(disks[1]).toEqual({
      name: "nvme0n1",
      readsCompleted: 1000,
      sectorsRead: 20000,
      writesCompleted: 500,
      sectorsWritten: 10000,
    });
    expect(parseDiskstats("8 0 sda 1 2 3\n8 0 sda x 0 1 0 1 0 1 0\n")).toEqual([]);
  });

  it("keeps whole physical disks that have done I/O", () => {
    expect(selectWholeDisks(parseDiskstats(DISKSTATS_FIRST)).map((disk) => disk.name)).toEqual([
      "nvme0n1",
      "sda",
    ]);
  });

  it("recognizes partition naming schemes and keeps partitions without their disk", () => {
    const disk = (name: string): DiskCounters => ({
      name,
      readsCompleted: 1,
      sectorsRead: 1,
      writesCompleted: 0,
      sectorsWritten: 0,
    });
    const names = [
      "mmcblk0",
      "mmcblk0p1",
      "mmcblk0boot0",
      "mmcblk0rpmb",
      "sdp",
      "sdp1",
      "vda2",
      "md127",
      "zram0",
      "nvme1n1",
    ];
    expect(selectWholeDisks(names.map(disk)).map((entry) => entry.name)).toEqual([
      "mmcblk0",
      "sdp",
      "vda2",
      "nvme1n1",
    ]);
  });
});

describe("/proc/net/dev", () => {
  it("reads received and sent bytes per interface", () => {
    const interfaces = parseNetDev(NET_DEV_FIRST);
    expect(interfaces[0]).toEqual({ name: "lo", rxBytes: 5000, txBytes: 5000 });
    expect(interfaces.find((entry) => entry.name === "eth0")).toEqual({
      name: "eth0",
      rxBytes: 1_000_000,
      txBytes: 500_000,
    });
  });

  it("handles counters that run into the colon and skips malformed lines", () => {
    expect(parseNetDev("eth0:123 1 0 0 0 0 0 0 456 1 0 0 0 0 0 0\n")).toEqual([
      { name: "eth0", rxBytes: 123, txBytes: 456 },
    ]);
    expect(parseNetDev(": 1 2 3 4 5 6 7 8 9\neth1: 1 2 3\neth2: x 0 0 0 0 0 0 0 1\n")).toEqual([]);
  });

  it("drops loopback and container or VM plumbing", () => {
    for (const name of ["eth0", "enp3s0", "wlan0", "wg0", "tailscale0", "br0", "vmbr0", "bond0"]) {
      expect(isPhysicalInterface(name)).toBe(true);
    }
    for (const name of ["lo", "docker0", "veth1a2b", "br-0123abcd", "virbr0", "tap100i0"]) {
      expect(isPhysicalInterface(name)).toBe(false);
    }
  });
});

describe("os-release", () => {
  it("prefers PRETTY_NAME", () => {
    expect(parseOsRelease(OS_RELEASE)).toBe("Debian GNU/Linux 12 (bookworm)");
  });

  it("falls back to NAME and VERSION, unquoting and unescaping values", () => {
    expect(parseOsRelease('NAME=\'Alpine Linux\'\nVERSION="3.20 \\"edge\\""\n# comment\n')).toBe(
      'Alpine Linux 3.20 "edge"'
    );
    expect(parseOsRelease("NAME=NixOS\n")).toBe("NixOS");
    expect(parseOsRelease("ID=unknown\n")).toBeNull();
  });
});

describe("/proc/cpuinfo", () => {
  it("reads the model name", () => {
    expect(parseCpuModel(CPUINFO)).toBe("Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz");
  });

  it("falls back to older ARM's Processor field and returns null otherwise", () => {
    expect(parseCpuModel("processor : 0\nProcessor : ARMv7  Processor rev 4 (v7l)\n")).toBe(
      "ARMv7 Processor rev 4 (v7l)"
    );
    expect(parseCpuModel("processor : 0\nmodel name :\nBogoMIPS : 108.00\n")).toBeNull();
  });

  it("reads cpu MHz per processor", () => {
    expect([...parseCpuinfoMhz(CPUINFO)]).toEqual([
      [0, 2100],
      [1, 2000],
    ]);
    expect(parseCpuinfoMhz("cpu MHz : 1000\nprocessor : x\ncpu MHz : 1000\n").size).toBe(0);
    expect(parseCpuinfoMhz("processor : 3\ncpu MHz : 0\n").size).toBe(0);
  });
});

describe("macOS vm_stat", () => {
  const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               10000.
Pages active:                            200000.
Pages inactive:                          150000.
Pages speculative:                         5000.
Pages wired down:                        100000.
Pages purgeable:                           2000.
`;

  it("counts free, inactive, speculative and purgeable pages as available", () => {
    expect(parseVmStatAvailable(vmStat)).toBe(167_000 * 16_384);
  });

  it("assumes 4 KiB pages when unstated and returns null without free pages", () => {
    expect(parseVmStatAvailable("Pages free: 10.\n")).toBe(10 * 4096);
    expect(parseVmStatAvailable("nothing useful")).toBeNull();
  });
});
