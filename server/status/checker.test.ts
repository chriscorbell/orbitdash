import { describe, expect, it } from "bun:test";
import type { CheckTarget } from "@shared/status";
import { createChecker, describeCheckError, MAX_REDIRECTS, type CheckTransport } from "./checker";

type FetchInit = Parameters<CheckTransport["fetch"]>[1];
type Handler = (url: string, init: FetchInit) => Response | Promise<Response>;

interface Harness {
  advance: (ms: number) => void;
  requests: Array<{ url: string; method: string; init: FetchInit }>;
  timeout: AbortController;
  run: ReturnType<typeof createChecker>;
}

function codeError(code: string, message = "secret https://user:pass@nas/") {
  return Object.assign(new Error(message), { code });
}

/** Resolves never, rejecting with the signal's reason once it aborts, like fetch does. */
function pendingUntilAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function harness(
  handler: Handler,
  connect: CheckTransport["connect"] = () => Promise.reject(new Error("no tcp"))
): Harness {
  let time = 1_000;
  const timeout = new AbortController();
  const requests: Harness["requests"] = [];
  const run = createChecker({
    clock: () => time,
    createTimeout: () => timeout.signal,
    transport: {
      fetch: async (url, init) => {
        requests.push({ url, method: String(init.method), init });
        return handler(url, init);
      },
      connect,
    },
  });
  return { advance: (ms) => (time += ms), requests, timeout, run };
}

const http = (url: string): CheckTarget => ({ method: "http", url });
const tcp = (host: string, port: number): CheckTarget => ({ method: "tcp", host, port });

describe("HTTP checks", () => {
  it("sends one HEAD request without following redirects itself and times the answer", async () => {
    const h = harness(() => {
      h.advance(42);
      return new Response(null, { status: 204 });
    });

    expect(await h.run({ target: http("https://nas.lan/"), ignoreTls: false })).toEqual({
      ok: true,
      latencyMs: 42,
      statusCode: 204,
      error: null,
    });
    expect(h.requests).toHaveLength(1);
    const { init } = h.requests[0];
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("manual");
    expect(new Headers(init.headers).get("user-agent")).toBe("orbitdash-status-check");
    expect(init.tls).toBeUndefined();
  });

  it("skips certificate checks only when asked", async () => {
    const h = harness(() => new Response(null, { status: 200 }));
    await h.run({ target: http("https://proxmox.lan:8006/"), ignoreTls: true });
    expect(h.requests[0].init.tls).toEqual({ rejectUnauthorized: false });
  });

  it("cancels the body as soon as the headers arrive", async () => {
    let cancelled = false;
    const h = harness(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200 }
        )
    );

    expect((await h.run({ target: http("http://nas/"), ignoreTls: false })).ok).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("falls back to GET when HEAD is refused", async () => {
    for (const refused of [405, 501]) {
      const h = harness((_url, init) =>
        init.method === "HEAD"
          ? new Response(null, { status: refused })
          : new Response("ok", { status: 200 })
      );
      expect(await h.run({ target: http("http://nas/"), ignoreTls: false })).toMatchObject({
        ok: true,
        statusCode: 200,
      });
      expect(h.requests.map((request) => request.method)).toEqual(["HEAD", "GET"]);
    }
  });

  it("retries with GET when HEAD fails, and reports the GET failure", async () => {
    const recovered = harness((_url, init) => {
      if (init.method === "HEAD") throw codeError("ECONNRESET");
      return new Response(null, { status: 200 });
    });
    expect((await recovered.run({ target: http("http://nas/"), ignoreTls: false })).ok).toBe(true);

    const refused = harness(() => {
      throw codeError("ConnectionRefused");
    });
    expect(await refused.run({ target: http("http://nas/"), ignoreTls: false })).toEqual({
      ok: false,
      latencyMs: null,
      statusCode: null,
      error: "Connection refused",
    });
    expect(refused.requests.map((request) => request.method)).toEqual(["HEAD", "GET"]);
  });

  it("follows redirects that stay on http(s), keeping the method", async () => {
    const h = harness((url) => {
      if (url === "http://nas/") {
        return new Response(null, { status: 301, headers: { location: "https://nas/login" } });
      }
      if (url === "https://nas/login") {
        return new Response(null, { status: 307, headers: { location: "/home" } });
      }
      return new Response(null, { status: 200 });
    });

    expect(await h.run({ target: http("http://nas/"), ignoreTls: false })).toMatchObject({
      ok: true,
      statusCode: 200,
    });
    expect(h.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "HEAD http://nas/",
      "HEAD https://nas/login",
      "HEAD https://nas/home",
    ]);
  });

  it("stops at a redirect to another scheme and counts the answer", async () => {
    for (const location of ["file:///etc/passwd", "http://[broken"]) {
      const h = harness(() => new Response(null, { status: 302, headers: { location } }));
      expect(await h.run({ target: http("http://nas/"), ignoreTls: false })).toMatchObject({
        ok: true,
        statusCode: 302,
      });
      expect(h.requests).toHaveLength(1);
    }
  });

  it("gives up after too many redirects", async () => {
    const h = harness(() => new Response(null, { status: 302, headers: { location: "/again" } }));
    expect(await h.run({ target: http("http://nas/"), ignoreTls: false })).toEqual({
      ok: false,
      latencyMs: null,
      statusCode: 302,
      error: "Too many redirects",
    });
    expect(h.requests).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("counts login walls as up and server errors as down", async () => {
    const forbidden = harness(() => new Response(null, { status: 401 }));
    expect((await forbidden.run({ target: http("http://nas/"), ignoreTls: false })).ok).toBe(true);

    const broken = harness(() => new Response(null, { status: 503 }));
    expect(await broken.run({ target: http("http://nas/"), ignoreTls: false })).toEqual({
      ok: false,
      latencyMs: null,
      statusCode: 503,
      error: "HTTP 503",
    });
  });

  it("times out without a GET retry", async () => {
    const h = harness((_url, init) => pendingUntilAborted(init.signal));
    const result = h.run({ target: http("http://nas/"), ignoreTls: false });
    h.timeout.abort(new DOMException("The operation timed out.", "TimeoutError"));

    expect(await result).toMatchObject({ ok: false, error: "Timed out" });
    expect(h.requests).toHaveLength(1);
  });

  it("reports a check cancelled from outside", async () => {
    const h = harness((_url, init) => pendingUntilAborted(init.signal));
    const stop = new AbortController();
    const result = h.run({ target: http("http://nas/"), ignoreTls: false, signal: stop.signal });
    stop.abort();

    expect(await result).toMatchObject({ ok: false, error: "Cancelled" });
  });
});

describe("TCP checks", () => {
  it("connects, closes the connection and times it", async () => {
    let ended = 0;
    const h = harness(
      () => new Response(null),
      async (hostname, port) => {
        expect([hostname, port]).toEqual(["fd00::2", 22]);
        h.advance(7);
        return { end: () => (ended += 1) };
      }
    );

    expect(await h.run({ target: tcp("fd00::2", 22), ignoreTls: false })).toEqual({
      ok: true,
      latencyMs: 7,
      statusCode: null,
      error: null,
    });
    expect(ended).toBe(1);
  });

  it("describes refused connections", async () => {
    const h = harness(
      () => new Response(null),
      () => Promise.reject(codeError("ECONNREFUSED"))
    );
    expect(await h.run({ target: tcp("nas", 1), ignoreTls: false })).toMatchObject({
      ok: false,
      error: "Connection refused",
    });

    const unknown = harness(
      () => new Response(null),
      () => Promise.reject(new Error("boom"))
    );
    expect((await unknown.run({ target: tcp("nas", 1), ignoreTls: false })).error).toBe(
      "Connection failed"
    );
  });

  it("times out and closes a connection that lands late", async () => {
    let land: (socket: { end: () => void }) => void = () => {};
    let ended = false;
    const h = harness(
      () => new Response(null),
      () => new Promise((resolve) => (land = resolve))
    );

    const result = h.run({ target: tcp("nas", 22), ignoreTls: false });
    h.timeout.abort();
    expect(await result).toMatchObject({ ok: false, error: "Timed out" });

    land({ end: () => (ended = true) });
    await Bun.sleep(0);
    expect(ended).toBe(true);
  });

  it("fails at once when already cancelled", async () => {
    const h = harness(
      () => new Response(null),
      () => new Promise(() => {})
    );
    const stop = new AbortController();
    stop.abort();
    expect(
      await h.run({ target: tcp("nas", 22), ignoreTls: false, signal: stop.signal })
    ).toMatchObject({ ok: false, error: "Cancelled" });
  });
});

describe("describeCheckError", () => {
  it("maps error codes to short reasons and never repeats the message", () => {
    expect(describeCheckError(codeError("ENOTFOUND"), "x")).toBe("Host not found");
    expect(describeCheckError(codeError("DEPTH_ZERO_SELF_SIGNED_CERT"), "x")).toBe(
      "Certificate not trusted"
    );
    expect(describeCheckError(codeError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), "x")).toBe(
      "Certificate not trusted"
    );
    expect(describeCheckError(codeError("CERT_HAS_EXPIRED"), "x")).toBe("Certificate expired");
    expect(describeCheckError(codeError("ERR_TLS_CERT_ALTNAME_INVALID"), "x")).toBe(
      "Certificate is for another host"
    );
    expect(describeCheckError(codeError("EWHATEVER"), "Request failed")).toBe("Request failed");
    expect(describeCheckError(new Error("https://user:pass@nas/"), "Request failed")).toBe(
      "Request failed"
    );
    expect(describeCheckError("boom", "Request failed")).toBe("Request failed");
  });
});
