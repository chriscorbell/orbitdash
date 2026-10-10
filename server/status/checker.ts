import { CHECK_TIMEOUT_MS, isAcceptedHttpStatus, type CheckTarget } from "@shared/status";
import type { CheckResult } from "./state";

/** Redirects followed before a check gives up; each must stay on http(s). */
export const MAX_REDIRECTS = 5;

const USER_AGENT = "orbitdash-status-check";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type FetchInit = RequestInit & { tls?: { rejectUnauthorized: boolean } };

export interface CheckTransport {
  fetch: (url: string, init: FetchInit) => Promise<Response>;
  /** Opens a TCP connection; the caller closes it with `end()`. */
  connect: (hostname: string, port: number) => Promise<{ end: () => void }>;
}

export interface CheckerOptions {
  transport?: CheckTransport;
  /** Monotonic milliseconds, for latency. */
  clock?: () => number;
  /** The per-check deadline; tests pass a signal they abort themselves. */
  createTimeout?: (ms: number) => AbortSignal;
  timeoutMs?: number;
}

export interface CheckRequest {
  ignoreTls: boolean;
  /** Aborted when the checker shuts down or the check is no longer wanted. */
  signal?: AbortSignal;
  target: CheckTarget;
}

export type RunCheck = (request: CheckRequest) => Promise<CheckResult>;

const noopSocketHandlers = {
  close() {},
  connectError() {},
  data() {},
  error() {},
  open() {},
};

export const bunTransport: CheckTransport = {
  fetch: (url, init) => fetch(url, init),
  connect: (hostname, port) => Bun.connect({ hostname, port, socket: noopSocketHandlers }),
};

const ERROR_MESSAGES: Record<string, string> = {
  ConnectionRefused: "Connection refused",
  ECONNREFUSED: "Connection refused",
  ENOTFOUND: "Host not found",
  EAI_AGAIN: "Host not found",
  DNSException: "Host not found",
  ECONNRESET: "Connection closed",
  ConnectionClosed: "Connection closed",
  EHOSTUNREACH: "Host unreachable",
  ENETUNREACH: "Network unreachable",
  CERT_HAS_EXPIRED: "Certificate expired",
  ERR_TLS_CERT_ALTNAME_INVALID: "Certificate is for another host",
};

/**
 * A short reason that is safe to store, show and log. Raw error messages can include the URL, and
 * with it credentials or tokens, so only the error code is ever looked at.
 */
export function describeCheckError(error: unknown, fallback: string): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code in ERROR_MESSAGES) return ERROR_MESSAGES[code];
  // OpenSSL's verification errors: DEPTH_ZERO_SELF_SIGNED_CERT, UNABLE_TO_VERIFY_LEAF_SIGNATURE...
  if (/CERT|SELF_SIGNED|^UNABLE_TO_/.test(code)) return "Certificate not trusted";
  return fallback;
}

function failure(error: string, statusCode: number | null = null): CheckResult {
  return { ok: false, latencyMs: null, statusCode, error };
}

/** Resolves a redirect's Location; null unless it stays on http(s). */
function redirectTarget(from: string, location: string): string | null {
  try {
    const next = new URL(location, from);
    return next.protocol === "http:" || next.protocol === "https:" ? next.toString() : null;
  } catch {
    return null;
  }
}

/** Rejects with the signal's reason once it aborts, so a connect attempt can't outlive it. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Runs status checks. HTTP checks send HEAD (falling back to GET when the server refuses HEAD or
 * drops the connection), follow up to MAX_REDIRECTS redirects that stay on http(s), and never read
 * a body: it is cancelled as soon as the headers arrive. TCP checks only open a connection and
 * close it again. Every check has one deadline for all of its requests.
 */
export function createChecker({
  transport = bunTransport,
  clock = () => performance.now(),
  createTimeout = (ms) => AbortSignal.timeout(ms),
  timeoutMs = CHECK_TIMEOUT_MS,
}: CheckerOptions = {}): RunCheck {
  async function request(
    url: string,
    method: "GET" | "HEAD",
    ignoreTls: boolean,
    deadline: AbortSignal
  ): Promise<Response> {
    const connection = new AbortController();
    const response = await transport.fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.any([deadline, connection.signal]),
      headers: { Accept: "*/*", "User-Agent": USER_AGENT },
      ...(ignoreTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
    // Only the status and headers matter, so the body goes before any of it downloads.
    response.body?.cancel().catch(() => {});
    connection.abort();
    return response;
  }

  async function checkHttp(
    url: string,
    ignoreTls: boolean,
    deadline: AbortSignal,
    describeAbort: () => string | null,
    startedAt: number
  ): Promise<CheckResult> {
    let method: "GET" | "HEAD" = "HEAD";
    let current = url;
    let redirects = 0;

    for (;;) {
      let response: Response;
      try {
        response = await request(current, method, ignoreTls, deadline);
      } catch (error) {
        const aborted = describeAbort();
        if (aborted) return failure(aborted);
        // Some servers reset the connection on HEAD; GET gets a second chance within the deadline.
        if (method === "HEAD") {
          method = "GET";
          continue;
        }
        return failure(describeCheckError(error, "Request failed"));
      }

      if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
        method = "GET";
        continue;
      }

      const location = REDIRECT_STATUSES.has(response.status)
        ? response.headers.get("location")
        : null;
      const next = location ? redirectTarget(current, location) : null;
      if (next) {
        if (redirects >= MAX_REDIRECTS) return failure("Too many redirects", response.status);
        redirects += 1;
        current = next;
        continue;
      }

      // A redirect elsewhere (another scheme) ends here: the service did answer.
      return isAcceptedHttpStatus(response.status)
        ? {
            ok: true,
            latencyMs: Math.round(clock() - startedAt),
            statusCode: response.status,
            error: null,
          }
        : failure(`HTTP ${response.status}`, response.status);
    }
  }

  async function checkTcp(
    host: string,
    port: number,
    deadline: AbortSignal,
    describeAbort: () => string | null,
    startedAt: number
  ): Promise<CheckResult> {
    const attempt = transport.connect(host, port);
    try {
      const socket = await untilAborted(attempt, deadline);
      socket.end();
      return {
        ok: true,
        latencyMs: Math.round(clock() - startedAt),
        statusCode: null,
        error: null,
      };
    } catch (error) {
      // A connection that lands after the deadline is closed straight away.
      attempt.then(
        (socket) => socket.end(),
        () => {}
      );
      return failure(describeAbort() ?? describeCheckError(error, "Connection failed"));
    }
  }

  return async ({ ignoreTls, signal, target }) => {
    const timeout = createTimeout(timeoutMs);
    const deadline = signal ? AbortSignal.any([timeout, signal]) : timeout;
    const describeAbort = () => {
      if (timeout.aborted) return "Timed out";
      if (signal?.aborted) return "Cancelled";
      return null;
    };
    const startedAt = clock();

    return target.method === "http"
      ? checkHttp(target.url, ignoreTls, deadline, describeAbort, startedAt)
      : checkTcp(target.host, target.port, deadline, describeAbort, startedAt);
  };
}
