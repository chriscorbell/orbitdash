import fs from "fs";

type FetchInit = RequestInit & { unix?: string };

export interface DockerEndpoint {
  /** Base URL for requests: http://host:port for TCP, http://docker for a socket. */
  baseUrl: string;
  socketPath: string | null;
  /** For logs and the UI: never includes credentials. */
  description: string;
}

const DEFAULT_SOCKET = "/var/run/docker.sock";

/**
 * Where Docker is: ORBITDASH_DOCKER_HOST, else DOCKER_HOST, else a mounted socket at the default
 * path. `tcp://dockerproxy:2375` (a docker-socket-proxy that only allows reads) is the safe
 * choice; a mounted socket works too but grants full control. "off" turns the integration off.
 */
export function resolveDockerEndpoint(
  env: Record<string, string | undefined> = process.env,
  socketExists: (path: string) => boolean = (path) => fs.existsSync(path)
): DockerEndpoint | null {
  const configured = (env.ORBITDASH_DOCKER_HOST ?? env.DOCKER_HOST ?? "").trim();
  if (configured.toLowerCase() === "off") return null;
  if (!configured) {
    return socketExists(DEFAULT_SOCKET)
      ? { baseUrl: "http://docker", socketPath: DEFAULT_SOCKET, description: DEFAULT_SOCKET }
      : null;
  }
  if (configured.startsWith("unix://")) {
    const socketPath = configured.slice("unix://".length);
    return { baseUrl: "http://docker", socketPath, description: socketPath };
  }
  try {
    const url = new URL(configured.replace(/^tcp:\/\//, "http://"));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const base = `${url.protocol}//${url.host}`;
    return { baseUrl: base, socketPath: null, description: url.host };
  } catch {
    return null;
  }
}

export class DockerError extends Error {}

export interface DockerClient {
  getJson: (path: string, signal?: AbortSignal) => Promise<unknown>;
  /** A streaming GET, e.g. /events; the caller reads and cancels the body. */
  stream: (path: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
}

export interface DockerClientDependencies {
  fetch: (url: string, init: FetchInit) => Promise<Response>;
}

const REQUEST_TIMEOUT_MS = 8_000;

function describeConnectionError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "EACCES" || code === "EPERM") return "No permission to use the Docker socket";
  if (code === "ENOENT" || code === "FailedToOpenSocket") return "The Docker socket isn't there";
  if (code === "ECONNREFUSED" || code === "ConnectionRefused")
    return "Docker refused the connection";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "The Docker host wasn't found";
  if (error instanceof DOMException && error.name === "TimeoutError") return "Docker didn't answer";
  return "Docker can't be reached";
}

/** Read-only access to the Docker Engine API over a socket or TCP. */
export function createDockerClient(
  endpoint: DockerEndpoint,
  deps: DockerClientDependencies = { fetch: (url, init) => fetch(url, init) }
): DockerClient {
  async function request(path: string, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await deps.fetch(`${endpoint.baseUrl}${path}`, {
        signal,
        headers: { Accept: "application/json" },
        ...(endpoint.socketPath ? { unix: endpoint.socketPath } : {}),
      });
    } catch (error) {
      throw new DockerError(describeConnectionError(error));
    }
    if (response.status === 403) {
      response.body?.cancel().catch(() => {});
      throw new DockerError("The Docker proxy doesn't allow this (enable CONTAINERS=1)");
    }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new DockerError(`Docker answered ${response.status}`);
    }
    return response;
  }

  return {
    async getJson(path, signal) {
      const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await request(path, signal ? AbortSignal.any([signal, deadline]) : deadline);
      return response.json();
    },
    async stream(path, signal) {
      const response = await request(path, signal);
      if (!response.body) throw new DockerError("Docker sent no event stream");
      return response.body;
    },
  };
}
