import fs from "fs";
import path from "path";

export interface StatfsResult {
  bavail: number; // blocks available to unprivileged users
  bfree: number; // free blocks, including reserved ones
  blocks: number;
  bsize: number;
}

/**
 * Read access to the host's files. Paths are host paths ("/proc/stat"); with a root set, they are
 * read under it ("/mnt/host/proc/stat"), so a container with the host's / mounted read-only sees
 * the host rather than itself. Nothing here throws: a file that can't be read is null or empty.
 * This is the only part of the metrics collector that touches the filesystem.
 */
export interface HostFs {
  /** The host root prefix, or "" when reading this machine's own view. */
  readonly root: string;
  list: (hostPath: string) => string[];
  read: (hostPath: string) => string | null;
  statfs: (hostPath: string) => StatfsResult | null;
}

/** ORBITDASH_HOST_ROOT as an absolute prefix; unset, blank or "/" means no prefix. */
export function normalizeHostRoot(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const resolved = path.resolve(trimmed);
  return resolved === "/" ? "" : resolved;
}

/**
 * A configured host path (ORBITDASH_DISK_PATH). It is a host path, but a value that already
 * includes the root ("/mnt/host/srv") is accepted too rather than read as "/mnt/host/mnt/host/srv".
 */
export function toHostPath(root: string, configured: string): string {
  if (root && (configured === root || configured.startsWith(`${root}/`))) {
    return configured.slice(root.length) || "/";
  }
  return configured;
}

export function createHostFs(
  root: string = normalizeHostRoot(process.env.ORBITDASH_HOST_ROOT)
): HostFs {
  const resolve = (hostPath: string) => (root ? path.join(root, hostPath) : hostPath);

  return {
    root,
    list: (hostPath) => {
      try {
        return fs.readdirSync(resolve(hostPath));
      } catch {
        return [];
      }
    },
    read: (hostPath) => {
      try {
        return fs.readFileSync(resolve(hostPath), "utf-8");
      } catch {
        return null;
      }
    },
    statfs: (hostPath) => {
      try {
        const stats = fs.statfsSync(resolve(hostPath));
        return {
          bavail: Number(stats.bavail),
          bfree: Number(stats.bfree),
          blocks: Number(stats.blocks),
          bsize: Number(stats.bsize),
        };
      } catch {
        return null;
      }
    },
  };
}

let defaultHostFs: HostFs | null = null;

/** The process-wide reader, configured from ORBITDASH_HOST_ROOT on first use. */
export function getHostFs(): HostFs {
  defaultHostFs ??= createHostFs();
  return defaultHostFs;
}
