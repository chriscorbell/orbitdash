import fs from "fs";
import os from "os";

export interface SystemInfo {
  cpuCount: number;
  hostname: string | null;
  platform: string;
  uptimeSeconds: number;
}

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

/** /proc/uptime reports the host's uptime even inside a container. */
export function readUptimeSeconds(
  readFile: (path: string) => string = (path) => fs.readFileSync(path, "utf-8")
): number {
  try {
    const seconds = Number.parseFloat(readFile("/proc/uptime").split(" ")[0]);
    if (Number.isFinite(seconds)) return Math.floor(seconds);
  } catch {
    // Not Linux, or /proc is unavailable.
  }
  return Math.floor(os.uptime());
}

export function getSystemInfo(): SystemInfo {
  return {
    cpuCount: os.availableParallelism?.() ?? os.cpus().length,
    hostname: resolveHostname(),
    platform: process.platform,
    uptimeSeconds: readUptimeSeconds(),
  };
}
