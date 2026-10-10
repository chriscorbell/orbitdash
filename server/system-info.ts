import fs from "fs";
import os from "os";
import type { SystemInfo } from "@shared/types";
import { getHostFs, type HostFs } from "./host/host-fs";
import { parseCpuModel, parseOsRelease } from "./host/procfs";

export type { SystemInfo };

const CONTAINER_ID_HOSTNAME = /^[0-9a-f]{12,64}$/;

/**
 * The host's name, if it means something to a person: ORBITDASH_HOSTNAME wins, and Docker's
 * default hostname (the container id) is hidden rather than shown as a hex string.
 */
export function resolveHostname(
  env: NodeJS.ProcessEnv = process.env,
  hostname: string = os.hostname(),
  inContainer: boolean = fs.existsSync("/.dockerenv")
): string | null {
  const configured = env.ORBITDASH_HOSTNAME?.trim();
  if (configured) return configured;
  if (inContainer && CONTAINER_ID_HOSTNAME.test(hostname)) return null;
  return hostname || null;
}

/** The host's own name from its /etc/hostname, when a host root is mounted. */
export function readHostRootHostname(hostFs: HostFs): string | null {
  if (!hostFs.root) return null;
  return hostFs.read("/etc/hostname")?.split("\n")[0].trim() || null;
}

/** /proc/uptime reports the host's uptime even inside a container. */
export function readUptimeSeconds(
  readFile: (path: string) => string | null = (path) => getHostFs().read(path)
): number {
  try {
    const seconds = Number.parseFloat(readFile("/proc/uptime") ?? "");
    if (Number.isFinite(seconds)) return Math.floor(seconds);
  } catch {
    // Not Linux, or /proc is unavailable.
  }
  return Math.floor(os.uptime());
}

/**
 * The host's OS name. Inside a container without a host root, os-release describes the image
 * rather than the host, so it's left out.
 */
export function readOsName(hostFs: HostFs, inContainer: boolean): string | null {
  if (inContainer && !hostFs.root) return null;
  const osRelease = hostFs.read("/etc/os-release") ?? hostFs.read("/usr/lib/os-release");
  return osRelease ? parseOsRelease(osRelease) : null;
}

/** The CPU model from /proc/cpuinfo, or what the runtime reports where that's missing. */
export function readCpuModel(
  hostFs: HostFs,
  cpus: () => Array<Pick<os.CpuInfo, "model">> = () => os.cpus()
): string | null {
  const cpuinfo = hostFs.read("/proc/cpuinfo");
  const fromCpuinfo = cpuinfo ? parseCpuModel(cpuinfo) : null;
  if (fromCpuinfo) return fromCpuinfo;
  const model = cpus()[0]?.model.trim();
  return model && model.toLowerCase() !== "unknown" ? model : null;
}

export function getSystemInfo(
  hostFs: HostFs = getHostFs(),
  inContainer: boolean = fs.existsSync("/.dockerenv")
): Omit<SystemInfo, "docker"> {
  const hostRootName = readHostRootHostname(hostFs);
  return {
    cpuCount: os.availableParallelism?.() ?? os.cpus().length,
    cpuModel: readCpuModel(hostFs),
    hostname: resolveHostname(
      process.env,
      hostRootName ?? os.hostname(),
      hostRootName ? false : inContainer
    ),
    // The kernel is shared with containers, so this is the host's either way.
    kernel: os.release() || null,
    osName: readOsName(hostFs, inContainer),
    platform: process.platform,
    uptimeSeconds: readUptimeSeconds((path) => hostFs.read(path)),
  };
}
