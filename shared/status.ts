import type {
  ServiceCheckConfig,
  StatusCheckMethod,
  StatusHistoryBucket,
  StatusHistoryRange,
} from "./types";
import { normalizeServiceUrl } from "./urls";

/**
 * Status check rules shared by the server (which runs the checks) and the browser (which edits
 * them and draws the results). Kept free of zod so the service form stays light.
 */

export const STATUS_CHECK_METHODS = ["http", "tcp"] as const satisfies readonly StatusCheckMethod[];
export const STATUS_HISTORY_RANGES = [
  "24h",
  "30d",
] as const satisfies readonly StatusHistoryRange[];

export const CHECK_INTERVAL_DEFAULT_S = 60;
export const CHECK_INTERVAL_MIN_S = 15;
export const CHECK_INTERVAL_MAX_S = 3600;
/** Intervals the service form offers. */
export const CHECK_INTERVAL_PRESETS_S = [15, 30, 60, 300, 900, 3600] as const;

/** A check that hasn't answered by then fails. */
export const CHECK_TIMEOUT_MS = 10_000;
/** A check that passes but takes longer than this counts as degraded. */
export const SLOW_RESPONSE_MS = 2_000;
/** Failed checks in a row before a reachable service shows as down, so one blip isn't an outage. */
export const FAILURES_BEFORE_DOWN = 2;

export const DEFAULT_CHECK_CONFIG: ServiceCheckConfig = {
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: CHECK_INTERVAL_DEFAULT_S,
  check_ignore_tls: false,
};

/**
 * HTTP statuses that mean the service is up: 2xx and 3xx, plus 401 and 403, because a login wall
 * still means the service answered.
 */
export function isAcceptedHttpStatus(status: number): boolean {
  return (status >= 200 && status < 400) || status === 401 || status === 403;
}

export interface HostPort {
  host: string; // IPv6 addresses without brackets
  port: number;
}

/** Where one check goes. */
export type CheckTarget = { method: "http"; url: string } | ({ method: "tcp" } & HostPort);

const HOST_PORT_PATTERN = /^(?:\[([0-9a-f:.]+)\]|([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)):(\d{1,5})$/i;

/** Parses `host:port`, `10.0.0.2:22` or `[fd00::2]:22`. */
export function parseHostPort(input: string): HostPort | null {
  const match = HOST_PORT_PATTERN.exec(input.trim());
  if (!match) return null;

  const port = Number(match[3]);
  if (port < 1 || port > 65_535) return null;
  return { host: (match[1] ?? match[2]).toLowerCase(), port };
}

export function formatHostPort({ host, port }: HostPort): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

export type CheckTargetResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Validates a typed check target for a method; blank means "use the link URL". */
export function normalizeCheckTarget(
  method: StatusCheckMethod,
  input: string | null | undefined
): CheckTargetResult {
  const trimmed = input?.trim() ?? "";
  if (trimmed === "") return { ok: true, value: null };

  if (method === "http") {
    const url = normalizeServiceUrl(trimmed);
    return url ? { ok: true, value: url } : { ok: false, error: "check url must be a valid URL" };
  }

  const hostPort = parseHostPort(trimmed);
  return hostPort
    ? { ok: true, value: formatHostPort(hostPort) }
    : { ok: false, error: "check address must be a host and port, like nas.lan:22" };
}

function hostPortFromUrl(url: string): HostPort | null {
  const normalized = normalizeServiceUrl(url);
  if (!normalized) return null;

  const parsed = new URL(normalized);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  return { host: parsed.hostname.replace(/^\[(.*)\]$/, "$1"), port };
}

/**
 * Where a service's check goes: its own target, or else its link URL (for TCP, the link's host
 * and port). Null when neither gives a usable address.
 */
export function resolveCheckTarget(
  config: Pick<ServiceCheckConfig, "check_method" | "check_target">,
  linkUrl: string
): CheckTarget | null {
  if (config.check_method === "http") {
    const url = normalizeServiceUrl(config.check_target ?? linkUrl);
    return url ? { method: "http", url } : null;
  }

  const hostPort = config.check_target
    ? parseHostPort(config.check_target)
    : hostPortFromUrl(linkUrl);
  return hostPort ? { method: "tcp", ...hostPort } : null;
}

export function describeCheckTarget(target: CheckTarget): string {
  return target.method === "http" ? target.url : formatHostPort(target);
}

export type CheckConfigResult =
  { ok: true; value: ServiceCheckConfig } | { ok: false; error: string };

/**
 * Applies a validated patch to a check config. Switching method without a new target clears the
 * old one, since a URL is no use to a TCP check and a host:port none to an HTTP one.
 */
export function resolveCheckConfig(
  current: ServiceCheckConfig,
  patch: Partial<ServiceCheckConfig>
): CheckConfigResult {
  const method = patch.check_method ?? current.check_method;
  const keptTarget = method === current.check_method ? current.check_target : null;
  const target = normalizeCheckTarget(
    method,
    patch.check_target !== undefined ? patch.check_target : keptTarget
  );
  if (!target.ok) return target;

  return {
    ok: true,
    value: {
      check_enabled: patch.check_enabled ?? current.check_enabled,
      check_method: method,
      check_target: target.value,
      check_interval: patch.check_interval ?? current.check_interval,
      check_ignore_tls: patch.check_ignore_tls ?? current.check_ignore_tls,
    },
  };
}

export type StatusBucketState = "none" | "up" | "degraded" | "down";

/**
 * How a stretch of history reads at a glance: down when every check failed, degraded when some
 * failed or most were slow, none without checks.
 */
export function bucketState(
  bucket: Pick<StatusHistoryBucket, "checks" | "failures" | "slow">
): StatusBucketState {
  if (bucket.checks === 0) return "none";
  if (bucket.failures >= bucket.checks) return "down";
  if (bucket.failures > 0 || bucket.slow * 2 > bucket.checks) return "degraded";
  return "up";
}
