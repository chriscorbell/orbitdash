import { describeCheckError } from "../status/checker";
import type { ChannelRequest } from "./channels";

/** Sends one request with a timeout and a few retries, and says how it went in safe words. */

export const DELIVERY_TIMEOUT_MS = 10_000;
/** Waits before the second and third attempts. */
export const RETRY_DELAYS_MS = [1_000, 4_000] as const;
const MAX_RETRY_AFTER_MS = 15_000;
const EXCERPT_BYTES = 2_048;
const EXCERPT_CHARS = 120;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DeliverOptions {
  fetch: FetchLike;
  /** Attempts in all; 1 sends once without retrying (tests from settings). */
  attempts?: number;
  /** Stops waiting and sending, for shutdown. */
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}

export interface DeliveryOutcome {
  ok: boolean;
  attempts: number;
  statusCode: number | null;
  /** Short and safe to store, show and log: never a URL, a token or a raw error message. */
  error: string | null;
  /** The receiver's own explanation ("Invalid Webhook Token"), shown only to whoever tested. */
  detail: string | null;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** The start of an error body: the `message` or `error` field of JSON, or nothing. */
async function readExcerpt(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < EXCERPT_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    return null;
  } finally {
    reader.cancel().catch(() => {});
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
  const record = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const text = [record.message, record.error].find((value) => typeof value === "string");
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return clean ? clean.slice(0, EXCERPT_CHARS) : null;
}

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : 0;
}

function describeFailure(error: unknown, timedOut: boolean): string {
  if (timedOut) return "Timed out";
  return describeCheckError(error, "Couldn't connect");
}

/**
 * Posts a channel request. Network errors, timeouts, 429 and 5xx answers are retried after a short
 * wait; other answers are final. Redirects are not followed, so a token only ever goes to the host
 * it was configured for.
 */
export async function deliver(
  request: ChannelRequest,
  {
    fetch,
    attempts = RETRY_DELAYS_MS.length + 1,
    signal,
    sleep: wait = sleep,
    timeoutMs = DELIVERY_TIMEOUT_MS,
  }: DeliverOptions
): Promise<DeliveryOutcome> {
  let outcome: DeliveryOutcome = {
    ok: false,
    attempts: 0,
    statusCode: null,
    error: "Cancelled",
    detail: null,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) return { ...outcome, error: "Cancelled" };
    const timeout = AbortSignal.timeout(timeoutMs);
    let delayMs: number = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    let retryable: boolean;

    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        redirect: "manual",
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
      if (response.status >= 200 && response.status < 300) {
        response.body?.cancel().catch(() => {});
        return {
          ok: true,
          attempts: attempt,
          statusCode: response.status,
          error: null,
          detail: null,
        };
      }

      const redirected = response.status >= 300 && response.status < 400;
      outcome = {
        ok: false,
        attempts: attempt,
        statusCode: response.status,
        error: redirected
          ? `Redirected (HTTP ${response.status}); use the final URL`
          : `HTTP ${response.status}`,
        detail: redirected ? null : await readExcerpt(response),
      };
      if (redirected) response.body?.cancel().catch(() => {});
      retryable = isRetryableStatus(response.status);
      delayMs = Math.max(delayMs, retryAfterMs(response));
    } catch (error) {
      if (signal?.aborted) return { ...outcome, attempts: attempt, error: "Cancelled" };
      outcome = {
        ok: false,
        attempts: attempt,
        statusCode: null,
        error: describeFailure(error, timeout.aborted),
        detail: null,
      };
      retryable = true;
    }

    if (!retryable || attempt === attempts) break;
    await wait(delayMs, signal);
  }
  return outcome;
}
