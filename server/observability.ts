export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LOG_LEVEL: LogLevel = "info";

// Successful hits on these are routine noise (Docker healthchecks, icon and asset fetches, the
// long-lived metrics stream), so they only show up at LOG_LEVEL=debug.
const QUIET_PATHS = new Set(["/healthz", "/readyz", "/api/health", "/api/metrics/stream"]);
const QUIET_PATH_PREFIXES = ["/api/icons/", "/assets/"];

function isLogLevel(value: string): value is LogLevel {
  return Object.hasOwn(LOG_LEVEL_RANK, value);
}

/** Reads `LOG_LEVEL`, falling back to `info` when it is unset or not a known level. */
export function getLogLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  return configured && isLogLevel(configured) ? configured : DEFAULT_LOG_LEVEL;
}

export function writeLog(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
  if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[getLogLevel()]) {
    return;
  }

  const line = JSON.stringify({
    level,
    event,
    observedAt: new Date().toISOString(),
    ...payload,
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function isQuietPath(path: string): boolean {
  return QUIET_PATHS.has(path) || QUIET_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function getRequestLogLevel(path: string, status: number): LogLevel {
  if (status >= 500) {
    return "error";
  }

  if (status >= 400) {
    return "warn";
  }

  return isQuietPath(path) ? "debug" : "info";
}

export function recordRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  writeLog(getRequestLogLevel(path, status), "request.completed", {
    durationMs,
    method,
    path,
    status,
  });
}

export function logOperationalError(
  error: unknown,
  context: { method: string; path: string }
): void {
  writeLog("error", "request.failed", {
    method: context.method,
    path: context.path,
    message: error instanceof Error ? error.message : "unknown error",
  });
}

export function logJobFailure(job: string, error: unknown): void {
  writeLog("error", "job.failed", {
    job,
    message: error instanceof Error ? error.message : "unknown error",
  });
}
