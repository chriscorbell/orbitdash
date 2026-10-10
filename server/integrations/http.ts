import { describeCheckError } from "../status/checker";
import { IntegrationError, type AdapterHttp } from "./types";

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 4 * 1024 * 1024;

type FetchInit = RequestInit & { tls?: { rejectUnauthorized: boolean } };
export type IntegrationFetch = (url: string, init: FetchInit) => Promise<Response>;

/** Requests against one app: relative paths, a deadline, optional self-signed TLS, safe errors. */
export function createAdapterHttp(
  baseUrl: string,
  {
    ignoreTls = false,
    fetch: send = (url, init) => fetch(url, init),
  }: { ignoreTls?: boolean; fetch?: IntegrationFetch } = {}
): AdapterHttp {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  async function raw(path: string, init: RequestInit & { form?: Record<string, string> } = {}) {
    const { form, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    let body = rest.body;
    if (form) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(form).toString();
    }
    const url = new URL(path.replace(/^\//, ""), base).toString();
    let response: Response;
    try {
      response = await send(url, {
        ...rest,
        body,
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(ignoreTls ? { tls: { rejectUnauthorized: false } } : {}),
      });
    } catch (error) {
      throw new IntegrationError(describeCheckError(error, "Couldn't reach it"));
    }
    if (response.status === 401 || response.status === 403) {
      response.body?.cancel().catch(() => {});
      throw new IntegrationError("It refused the credentials");
    }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new IntegrationError(`It answered HTTP ${response.status}`);
    }
    return response;
  }

  return {
    raw,
    async json(path, init) {
      const response = await raw(path, init);
      const text = await response.text();
      if (text.length > MAX_BYTES) throw new IntegrationError("Its answer was too large");
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new IntegrationError("Its answer wasn't JSON; check the address");
      }
    },
  };
}
