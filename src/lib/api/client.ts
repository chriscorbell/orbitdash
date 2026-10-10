import { ORIGIN_HEADER } from "@shared/events";
import { TAB_ID } from "@/lib/tab-id";

const API_BASE = "";

/** Anything that validates an unknown value into T (zod and zod/mini schemas both fit). */
export interface Parser<T> {
  parse: (data: unknown) => T;
}

function getErrorMessage(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return null;
}

async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) {
    return;
  }

  let message = fallbackMessage;
  try {
    const data = await res.json();
    const errorMessage = getErrorMessage(data);
    if (errorMessage) {
      message = errorMessage;
    }
  } catch {
    // Fall back to the default message when the response body is not JSON.
  }

  throw new Error(message);
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
