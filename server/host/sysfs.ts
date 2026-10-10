import type { HostTemperature } from "@shared/types";
import type { HostFs } from "./host-fs";
import { parseCpuinfoMhz } from "./procfs";

/**
 * Readers for /sys: temperature sensors and CPU frequencies. They read through an injected HostFs,
 * so tests hand them a fake tree, and they skip anything missing or unreadable.
 */

const CPU_CHIPS = new Set(["coretemp", "k10temp", "zenpower"]);

/** SoC and package sensors that stand in for the CPU on ARM boards and in thermal zones. */
const CPU_THERMAL = /^(x86_pkg_temp|(cpu|soc)\d*[-_]thermal)$/;

/**
 * drivetemp asks the disk itself, and the kernel docs warn that can reset an HDD's spin-down
 * timer; sampling it regularly would keep sleeping disks awake.
 */
const SKIPPED_CHIPS = new Set(["drivetemp"]);

/**
 * Every NVMe sensor read sends the drive a SMART log command (milliseconds each, and it can wake
 * the drive from a low-power state), so only temp1, the Composite reading smartctl reports, is
 * read.
 */
function isSkippedSensor(chip: string, index: string): boolean {
  return chip === "nvme" && index !== "1";
}

/** Millidegrees Celsius to degrees, one decimal; out-of-range values mean "no sensor". */
export function parseMillidegrees(text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const celsius = Math.round(Number(text.trim()) / 100) / 10;
  return Number.isFinite(celsius) && celsius > -40 && celsius < 150 ? celsius : null;
}

function chipRank(chip: string): number {
  if (CPU_CHIPS.has(chip)) return 0;
  if (CPU_THERMAL.test(chip)) return 1;
  if (chip === "nvme") return 2;
  return 3;
}

/** CPU sensors first, then NVMe drives, then everything else; numeric order within a chip. */
export function sortTemperatures(sensors: HostTemperature[]): HostTemperature[] {
  return [...sensors].sort(
    (left, right) =>
      chipRank(left.chip) - chipRank(right.chip) ||
      left.chip.localeCompare(right.chip) ||
      left.id.localeCompare(right.id, undefined, { numeric: true })
  );
}

function readHwmonTemperatures(fs: HostFs): HostTemperature[] {
  const sensors: HostTemperature[] = [];
  for (const dir of fs.list("/sys/class/hwmon")) {
    if (!/^hwmon\d+$/.test(dir)) continue;
    const base = `/sys/class/hwmon/${dir}`;
    const chip = fs.read(`${base}/name`)?.trim();
    if (!chip || SKIPPED_CHIPS.has(chip)) continue;

    for (const file of fs.list(base)) {
      const index = /^temp(\d+)_input$/.exec(file)?.[1];
      if (!index || isSkippedSensor(chip, index)) continue;
      const celsius = parseMillidegrees(fs.read(`${base}/${file}`));
      if (celsius === null) continue;
      const label = fs.read(`${base}/temp${index}_label`)?.trim() || null;
      sensors.push({ id: `${dir}/temp${index}`, chip, label, celsius });
    }
  }
  return sensors;
}

function readThermalZones(fs: HostFs): HostTemperature[] {
  return fs.list("/sys/class/thermal").flatMap((dir) => {
    if (!/^thermal_zone\d+$/.test(dir)) return [];
    const base = `/sys/class/thermal/${dir}`;
    const celsius = parseMillidegrees(fs.read(`${base}/temp`));
    if (celsius === null) return [];
    return [{ id: dir, chip: fs.read(`${base}/type`)?.trim() || dir, label: null, celsius }];
  });
}

/** hwmon sensors, or thermal zones on machines that expose no hwmon temperatures. */
export function readTemperatures(fs: HostFs): HostTemperature[] {
  const hwmon = readHwmonTemperatures(fs);
  return sortTemperatures(hwmon.length > 0 ? hwmon : readThermalZones(fs));
}

const isCpuChip = (sensor: HostTemperature) => CPU_CHIPS.has(sensor.chip);

/** Most specific first: Intel package, AMD die, AMD control, any CPU sensor, SoC or zone. */
const CPU_TEMPERATURE_RULES: Array<(sensor: HostTemperature) => boolean> = [
  (sensor) => sensor.chip === "coretemp" && (sensor.label ?? "").startsWith("Package id"),
  (sensor) => isCpuChip(sensor) && sensor.label === "Tdie",
  (sensor) => isCpuChip(sensor) && sensor.label === "Tctl",
  isCpuChip,
  (sensor) => CPU_THERMAL.test(sensor.chip),
];

/** The headline CPU temperature: the hottest sensor of the most specific kind present. */
export function pickCpuTemperature(sensors: HostTemperature[]): number | null {
  for (const rule of CPU_TEMPERATURE_RULES) {
    const matches = sensors.filter(rule);
    if (matches.length > 0) return Math.max(...matches.map((sensor) => sensor.celsius));
  }
  return null;
}

/**
 * Current MHz per core from cpufreq, or from /proc/cpuinfo where cpufreq is missing (common in
 * VMs). Cores with no reading are left out.
 */
export function readCoreFrequencies(fs: HostFs, coreIds: number[]): Map<number, number> {
  const mhzByCore = new Map<number, number>();
  for (const id of coreIds) {
    const khz = Number(fs.read(`/sys/devices/system/cpu/cpu${id}/cpufreq/scaling_cur_freq`));
    if (Number.isFinite(khz) && khz > 0) mhzByCore.set(id, Math.round(khz / 1000));
  }
  if (mhzByCore.size > 0) return mhzByCore;

  const cpuinfo = fs.read("/proc/cpuinfo");
  return cpuinfo ? parseCpuinfoMhz(cpuinfo) : mhzByCore;
}
