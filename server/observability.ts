interface RequestMetricsSnapshot {
  failuresTotal: number;
  lastFailureAt: string | null;
  requestsTotal: number;
}

const requestMetrics = {
  failuresTotal: 0,
  lastFailureAt: null as string | null,
  requestsTotal: 0,
};

function writeLog(level: "error" | "info", event: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    event,
    observedAt: new Date().toISOString(),
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function recordRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  requestMetrics.requestsTotal += 1;
  if (status >= 400) {
    requestMetrics.failuresTotal += 1;
    requestMetrics.lastFailureAt = new Date().toISOString();
  }

  writeLog("info", "request.completed", {
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

export function getRequestMetricsSnapshot(): RequestMetricsSnapshot {
  return { ...requestMetrics };
}

export function resetObservabilityForTesting(): void {
  requestMetrics.failuresTotal = 0;
  requestMetrics.lastFailureAt = null;
  requestMetrics.requestsTotal = 0;
}
