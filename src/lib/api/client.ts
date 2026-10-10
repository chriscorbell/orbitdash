import { ORIGIN_HEADER } from "@shared/events";
import { TAB_ID } from "@/lib/tab-id";

const API_BASE = "";

/** Anything that validates an unknown value into T (zod and zod/mini schemas both fit). */
export interface Parser<T> {
  parse: (data: unknown) => T;
}

/** A failed API call, with its HTTP status and, for 429s, how many seconds to wait. */
export class ApiError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

let authChallengeHandler: ((auth: unknown) => void) | null = null;

/**
 * Receives the auth state that 401 and 403 replies carry, so an expired session goes back to the
 * sign-in screen (or a guest view) from wherever the failing request was made.
 */
export function setAuthChallengeHandler(handler: ((auth: unknown) => void) | null) {
  authChallengeHandler = handler;
}

function readField(data: unknown, field: string): unknown {
  return typeof data === "object" && data !== null && field in data
    ? (data as Record<string, unknown>)[field]
    : undefined;
}

async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) {
    return;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Fall back to the default message when the response body is not JSON.
  }

  const auth = readField(data, "auth");
  if ((res.status === 401 || res.status === 403) && auth !== undefined) {
    authChallengeHandler?.(auth);
  }

  const error = readField(data, "error");
  const retryAfter = Number(res.headers.get("retry-after"));
  throw new ApiError(
    typeof error === "string" && error ? error : fallbackMessage,
    res.status,
    retryAfter > 0 ? retryAfter : null
  );
}

export async function request(
  path: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    headers.set(ORIGIN_HEADER, TAB_ID);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  await throwIfNotOk(res, fallbackMessage);
  return res;
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  schema: Parser<T>
): Promise<T> {
  const res = await request(path, init, fallbackMessage);
  const data = await res.json();
  return schema.parse(data);
}

/** JSON request body helper for PUT/POST/PATCH. */
export function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
