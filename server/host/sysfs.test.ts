import { describe, expect, it } from "bun:test";
import type { HostTemperature } from "@shared/types";
import {
  parseMillidegrees,
  pickCpuTemperature,
  readCoreFrequencies,
  readTemperatures,
  sortTemperatures,
} from "./sysfs";
import { CPUINFO, createFakeHostFs, HWMON_FILES } from "./test-fixtures";

const sensor = (chip: string, label: string | null, celsius: number, id = `${chip}/1`) => ({
  id,
  chip,
  label,
  celsius,
});

describe("temperatures", () => {
  it("reads hwmon sensors, CPU first, skipping drivetemp, extra NVMe sensors and bad values", () => {
    expect(readTemperatures(createFakeHostFs(HWMON_FILES))).toEqual([
      { id: "hwmon2/temp1", chip: "coretemp", label: "Package id 0", celsius: 52 },
      { id: "hwmon2/temp2", chip: "coretemp", label: "Core 0", celsius: 49 },
      { id: "hwmon2/temp3", chip: "coretemp", label: "Core 1", celsius: 50 },
      { id: "hwmon2/temp10", chip: "coretemp", label: "Core 8", celsius: 51 },
      { id: "hwmon1/temp1", chip: "nvme", label: "Composite", celsius: 38.9 },
      { id: "hwmon0/temp1", chip: "acpitz", label: null, celsius: 27.8 },
    ]);
  });

  it("ignores hwmon entries without a name and stray files", () => {
    const fs = createFakeHostFs({
      "/sys/class/hwmon/hwmon0/temp1_input": "40000",
      "/sys/class/hwmon/README": "not a device",
    });
    expect(readTemperatures(fs)).toEqual([]);
  });

  it("falls back to thermal zones when hwmon has no temperatures", () => {
    const fs = createFakeHostFs({
      "/sys/class/hwmon/hwmon0/name": "BAT0",
      "/sys/class/thermal/thermal_zone0/type": "acpitz\n",
      "/sys/class/thermal/thermal_zone0/temp": "27800\n",
      "/sys/class/thermal/thermal_zone1/type": "x86_pkg_temp\n",
      "/sys/class/thermal/thermal_zone1/temp": "49000\n",
      "/sys/class/thermal/thermal_zone2/temp": "45000\n",
      "/sys/class/thermal/thermal_zone3/type": "SEN1\n",
      "/sys/class/thermal/cooling_device0/type": "Processor\n",
    });
    const temperatures = readTemperatures(fs);
    expect(temperatures).toEqual([
      { id: "thermal_zone1", chip: "x86_pkg_temp", label: null, celsius: 49 },
      { id: "thermal_zone0", chip: "acpitz", label: null, celsius: 27.8 },
      { id: "thermal_zone2", chip: "thermal_zone2", label: null, celsius: 45 },
    ]);
    expect(pickCpuTemperature(temperatures)).toBe(49);
  });

  it("returns nothing on machines without sensors", () => {
    expect(readTemperatures(createFakeHostFs({}))).toEqual([]);
  });

  it("parses millidegrees and treats out-of-range readings as missing", () => {
    expect(parseMillidegrees("45678\n")).toBe(45.7);
    expect(parseMillidegrees("-5000")).toBe(-5);
    expect(parseMillidegrees(null)).toBeNull();
    expect(parseMillidegrees(" ")).toBeNull();
    expect(parseMillidegrees("n/a")).toBeNull();
    expect(parseMillidegrees("-128000")).toBeNull();
    expect(parseMillidegrees("150000")).toBeNull();
  });

  it("sorts CPU, then SoC, then NVMe, then the rest by chip and sensor number", () => {
    const sorted = sortTemperatures([
      sensor("acpitz", null, 30),
      sensor("nvme", "Composite", 40),
      sensor("cpu_thermal", null, 50),
      sensor("amdgpu", "edge", 45),
      sensor("k10temp", "Tccd10", 60, "hwmon1/temp10"),
      sensor("k10temp", "Tctl", 61, "hwmon1/temp2"),
    ]);
    expect(sorted.map((entry) => `${entry.chip}:${entry.label}`)).toEqual([
      "k10temp:Tctl",
      "k10temp:Tccd10",
      "cpu_thermal:null",
      "nvme:Composite",
      "acpitz:null",
      "amdgpu:edge",
    ]);
  });
});

describe("CPU temperature", () => {
  const pick = (...sensors: HostTemperature[]) => pickCpuTemperature(sensors);

  it("prefers the hottest Intel package", () => {
    expect(
      pick(
        sensor("coretemp", "Core 0", 70),
        sensor("coretemp", "Package id 0", 55),
        sensor("coretemp", "Package id 1", 58)
      )
    ).toBe(58);
  });

  it("prefers AMD's Tdie over Tctl, then any CPU sensor", () => {
    expect(pick(sensor("k10temp", "Tctl", 75), sensor("k10temp", "Tdie", 55))).toBe(55);
    expect(pick(sensor("zenpower", "Tctl", 61), sensor("zenpower", "Tccd1", 70))).toBe(61);
    expect(pick(sensor("coretemp", "Core 0", 44), sensor("coretemp", null, 46))).toBe(46);
  });

  it("uses SoC sensors on ARM boards and gives up when nothing fits", () => {
    expect(pick(sensor("nvme", "Composite", 40), sensor("cpu_thermal", null, 52))).toBe(52);
    expect(pick(sensor("soc-thermal", null, 48))).toBe(48);
    expect(pick(sensor("nvme", "Composite", 40), sensor("acpitz", null, 30))).toBeNull();
    expect(pick()).toBeNull();
  });
});

describe("CPU frequencies", () => {
  it("reads cpufreq in MHz for the given cores", () => {
    const fs = createFakeHostFs({
      "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq": "3400000\n",
      "/sys/devices/system/cpu/cpu1/cpufreq/scaling_cur_freq": "garbage\n",
      "/sys/devices/system/cpu/cpu2/cpufreq/scaling_cur_freq": "799999\n",
      "/proc/cpuinfo": CPUINFO,
    });
    expect([...readCoreFrequencies(fs, [0, 1, 2])]).toEqual([
      [0, 3400],
      [2, 800],
    ]);
  });

  it("falls back to /proc/cpuinfo, and to nothing", () => {
    expect([
      ...readCoreFrequencies(createFakeHostFs({ "/proc/cpuinfo": CPUINFO }), [0, 1]),
    ]).toEqual([
      [0, 2100],
      [1, 2000],
    ]);
    expect(readCoreFrequencies(createFakeHostFs({}), [0]).size).toBe(0);
  });
});
