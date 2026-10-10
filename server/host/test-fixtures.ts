import type { HostFs, StatfsResult } from "./host-fs";

/**
 * A HostFs over an in-memory tree: `files` maps host paths to contents, directories are implied by
 * the paths, and statfs answers only for the mountpoints given. Mutate `files` between collects to
 * simulate counters moving.
 */
export function createFakeHostFs(
  files: Record<string, string>,
  statfs: Record<string, StatfsResult> = {},
  root = ""
): HostFs & { files: Record<string, string> } {
  return {
    files,
    root,
    list: (dir) => {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const children = new Set<string>();
      for (const path of Object.keys(files)) {
        if (path.startsWith(prefix)) children.add(path.slice(prefix.length).split("/")[0]);
      }
      return [...children];
    },
    read: (path) => files[path] ?? null,
    statfs: (path) => statfs[path] ?? null,
  };
}

/** A two-core machine; the second reading is one second (100 jiffies per core) later. */
export const PROC_STAT_FIRST = `cpu  2000 100 1000 16000 400 0 100 0 50 0
cpu0 1000 50 500 8000 200 0 50 0 25 0
cpu1 1000 50 500 8000 200 0 50 0 25 0
intr 123456 0 0
ctxt 987654
btime 1700000000
`;

// cpu0 spent 50 of its 100 jiffies busy, cpu1 spent 25.
export const PROC_STAT_SECOND = `cpu  2060 100 1015 16125 400 0 100 0 50 0
cpu0 1040 50 510 8050 200 0 50 0 25 0
cpu1 1020 50 505 8075 200 0 50 0 25 0
intr 123999 0 0
`;

export const MEMINFO = `MemTotal:       16000000 kB
MemFree:         2000000 kB
MemAvailable:    10000000 kB
Buffers:          500000 kB
Cached:          6000000 kB
SwapCached:        10000 kB
SReclaimable:     500000 kB
SwapTotal:       4000000 kB
SwapFree:        3000000 kB
`;

export const LOADAVG = "0.52 0.58 0.59 2/1234 56789\n";

export const MOUNTS = `/dev/nvme0n1p2 / ext4 rw,relatime 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0
tmpfs /run tmpfs rw,nosuid,nodev,size=1593452k,mode=755 0 0
/dev/nvme0n1p1 /boot/efi vfat rw,relatime,fmask=0077 0 0
/dev/sda1 /mnt/media\\040library ext4 rw,relatime 0 0
/dev/sda1 /srv/media ext4 rw,relatime 0 0
/dev/loop3 /snap/core22/1380 squashfs ro,nodev,relatime 0 0
overlay /var/lib/docker/overlay2/abc/merged overlay rw,relatime 0 0
nas:/export /mnt/nas nfs4 rw,relatime 0 0
`;

export const STATFS = {
  "/": { blocks: 1000, bsize: 4096, bavail: 400, bfree: 450 },
  "/boot/efi": { blocks: 100, bsize: 4096, bavail: 90, bfree: 90 },
  "/srv/media": { blocks: 5000, bsize: 4096, bavail: 1000, bfree: 1000 },
} satisfies Record<string, StatfsResult>;

export const DISKSTATS_FIRST = `   7       0 loop0 11 0 28 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 259       0 nvme0n1 1000 0 20000 0 500 0 10000 0 0 0 0 0 0 0 0 0 0
 259       1 nvme0n1p1 10 0 200 0 1 0 8 0 0 0 0 0 0 0 0 0 0
 259       2 nvme0n1p2 990 0 19800 0 499 0 9992 0 0 0 0 0 0 0 0 0 0
   8       0 sda 100 0 4000 0 0 0 0 0 0 0 0 0 0 0 0 0 0
   8       1 sda1 100 0 4000 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 253       0 dm-0 50 0 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0
   8      16 sdb 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
`;

// nvme0n1 read 2048 sectors (1 MiB) and wrote 4096 (2 MiB); sda was re-created and reset.
export const DISKSTATS_SECOND = `   7       0 loop0 11 0 28 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 259       0 nvme0n1 1100 0 22048 0 600 0 14096 0 0 0 0 0 0 0 0 0 0
 259       1 nvme0n1p1 10 0 200 0 1 0 8 0 0 0 0 0 0 0 0 0 0
 259       2 nvme0n1p2 1090 0 21848 0 599 0 14088 0 0 0 0 0 0 0 0 0 0
   8       0 sda 5 0 16 0 0 0 0 0 0 0 0 0 0 0 0 0 0
   8       1 sda1 5 0 16 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 253       0 dm-0 50 0 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0
   8      16 sdb 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
`;

const NET_DEV_HEADER = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
`;

export const NET_DEV_FIRST = `${NET_DEV_HEADER}    lo: 5000 50 0 0 0 0 0 0 5000 50 0 0 0 0 0 0
  eth0: 1000000 900 0 0 0 0 0 0 500000 400 0 0 0 0 0 0
docker0: 300 3 0 0 0 0 0 0 300 3 0 0 0 0 0 0
vethab12cd: 300 3 0 0 0 0 0 0 300 3 0 0 0 0 0 0
br-0123456789ab: 300 3 0 0 0 0 0 0 300 3 0 0 0 0 0 0
 wlan0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
`;

// eth0 received 125000 bytes and sent 25000; wg0 came up between readings.
export const NET_DEV_SECOND = `${NET_DEV_HEADER}    lo: 9000 90 0 0 0 0 0 0 9000 90 0 0 0 0 0 0
  eth0: 1125000 1000 0 0 0 0 0 0 525000 450 0 0 0 0 0 0
   wg0: 2000 10 0 0 0 0 0 0 1000 5 0 0 0 0 0 0
docker0: 300 3 0 0 0 0 0 0 300 3 0 0 0 0 0 0
 wlan0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
`;

/** An Intel desktop with an NVMe drive, a SATA disk behind drivetemp, and a wifi card. */
export const HWMON_FILES: Record<string, string> = {
  "/sys/class/hwmon/hwmon0/name": "acpitz\n",
  "/sys/class/hwmon/hwmon0/temp1_input": "27800\n",
  "/sys/class/hwmon/hwmon1/name": "nvme\n",
  "/sys/class/hwmon/hwmon1/temp1_input": "38850\n",
  "/sys/class/hwmon/hwmon1/temp1_label": "Composite\n",
  "/sys/class/hwmon/hwmon1/temp2_input": "41850\n",
  "/sys/class/hwmon/hwmon1/temp2_label": "Sensor 1\n",
  "/sys/class/hwmon/hwmon2/name": "coretemp\n",
  "/sys/class/hwmon/hwmon2/temp1_input": "52000\n",
  "/sys/class/hwmon/hwmon2/temp1_label": "Package id 0\n",
  "/sys/class/hwmon/hwmon2/temp2_input": "49000\n",
  "/sys/class/hwmon/hwmon2/temp2_label": "Core 0\n",
  "/sys/class/hwmon/hwmon2/temp10_input": "51000\n",
  "/sys/class/hwmon/hwmon2/temp10_label": "Core 8\n",
  "/sys/class/hwmon/hwmon2/temp3_input": "50000\n",
  "/sys/class/hwmon/hwmon2/temp3_label": "Core 1\n",
  "/sys/class/hwmon/hwmon3/name": "drivetemp\n",
  "/sys/class/hwmon/hwmon3/temp1_input": "33000\n",
  "/sys/class/hwmon/hwmon4/name": "iwlwifi_1\n",
  "/sys/class/hwmon/hwmon4/temp1_input": "-128000\n",
  "/sys/class/hwmon/hwmon5/name": "BAT0\n",
  "/sys/class/hwmon/hwmon5/in0_input": "13100\n",
};

export const CPUINFO = `processor	: 0
vendor_id	: GenuineIntel
model name	: Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz
cpu MHz		: 2100.000

processor	: 1
vendor_id	: GenuineIntel
model name	: Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz
cpu MHz		: 1999.512
`;

export const OS_RELEASE = `PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
NAME="Debian GNU/Linux"
VERSION_ID="12"
ID=debian
`;

/** Every file a full Linux reading needs, at the first reading. */
export function linuxHostFiles(): Record<string, string> {
  return {
    "/proc/stat": PROC_STAT_FIRST,
    "/proc/meminfo": MEMINFO,
    "/proc/loadavg": LOADAVG,
    "/proc/1/mounts": MOUNTS,
    "/proc/diskstats": DISKSTATS_FIRST,
    "/proc/1/net/dev": NET_DEV_FIRST,
    "/proc/cpuinfo": CPUINFO,
    "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq": "3400000\n",
    "/sys/devices/system/cpu/cpu1/cpufreq/scaling_cur_freq": "800000\n",
    ...HWMON_FILES,
  };
}
