import { FAILURES_BEFORE_DOWN, SLOW_RESPONSE_MS } from "@shared/status";
import type { ServiceStatus, ServiceStatusState } from "@shared/types";

/** What one check found. */
export interface CheckResult {
  ok: boolean;
  latencyMs: number | null; // time to the answer; null when the check failed
  statusCode: number | null; // HTTP status of the final answer, null for TCP or no answer
  error: string | null; // short, safe reason for a failure (never a URL or a raw error message)
}

/** A service's current status as stored in service_status. */
export interface StoredStatus {
  serviceId: string;
  targetKey: string; // which target the status describes
  state: ServiceStatusState;
  failures: number; // failed checks in a row
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: number | null;
  changedAt: number | null;
}

export function unknownStatus(serviceId: string, targetKey: string): StoredStatus {
  return {
    serviceId,
    targetKey,
    state: "unknown",
    failures: 0,
    latencyMs: null,
    statusCode: null,
    error: null,
    checkedAt: null,
    changedAt: null,
  };
}

/** A check that passed is slow (degraded) past SLOW_RESPONSE_MS. */
export function isSlow(result: Pick<CheckResult, "ok" | "latencyMs">): boolean {
  return result.ok && result.latencyMs !== null && result.latencyMs > SLOW_RESPONSE_MS;
}

const isReachable = (state: ServiceStatusState) => state === "up" || state === "degraded";

/**
 * The status after a check. A reachable service only turns down after FAILURES_BEFORE_DOWN failed
 * checks in a row; until then it keeps its state (and last latency) and records the error. A
 * service that was down or never checked turns down on the first failure and back up on the first
 * success. `changedAt` moves when the service goes down or comes back, not between up and
 * degraded, so "up for 3h" stays true while it is merely slow.
 */
export function applyCheckResult(
  previous: StoredStatus,
  result: CheckResult,
  now: number
): StoredStatus {
  const failures = result.ok ? 0 : previous.failures + 1;
  let state: ServiceStatusState;
  if (result.ok) {
    state = isSlow(result) ? "degraded" : "up";
  } else if (isReachable(previous.state) && failures < FAILURES_BEFORE_DOWN) {
    state = previous.state;
  } else {
    state = "down";
  }

  const changed =
    previous.state === "unknown" || (previous.state === "down") !== (state === "down");

  return {
    ...previous,
    state,
    failures,
    latencyMs: result.ok ? result.latencyMs : state === "down" ? null : previous.latencyMs,
    statusCode: result.statusCode,
    error: result.error,
    checkedAt: now,
    changedAt: changed ? now : previous.changedAt,
  };
}

/** A first failure that hasn't turned the service down yet is worth confirming soon. */
export function needsConfirmation(status: StoredStatus): boolean {
  return status.failures > 0 && status.state !== "down";
}

export function toServiceStatus(status: StoredStatus): ServiceStatus {
  return {
    id: status.serviceId,
    state: status.state,
    latencyMs: status.latencyMs,
    statusCode: status.statusCode,
    error: status.error,
    checkedAt: status.checkedAt,
    changedAt: status.changedAt,
  };
}
