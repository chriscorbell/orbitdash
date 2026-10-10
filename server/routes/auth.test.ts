import { afterEach, describe, expect, it, jest, spyOn } from "bun:test";
import { authSessionSchema } from "@shared/auth-schemas";
import { app } from "../app";
import { parseAuthConfig } from "../auth/config";
import { getDb } from "../db";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { KEEP_ALIVE_MS } from "./events";

const PASSWORD = "correct horse battery";
const CLIENT_IP = "192.0.2.10";
const PROXY_IP = "10.0.0.2";

let testDataDir: string | null = null;

function start(env: Record<string, string> = {}) {
  testDataDir = createTestDataDir("orbitdash-auth-routes-");
  initializeServer({
    auth: parseAuthConfig(env),
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
}

afterEach(() => {
  jest.useRealTimers();
  shutdown();
  if (testDataDir) cleanupTestDatabase(testDataDir);
  testDataDir = null;
});

/** The Bun server hands Hono a requestIP() for the socket peer; tests pass one the same way. */
function peerEnv(address: string) {
  return { requestIP: () => ({ address, family: "IPv4", port: 40_000 }) };
}

interface CallOptions extends RequestInit {
  cookie?: string;
  peer?: string;
}

async function call(
  path: string,
  { cookie, peer = CLIENT_IP, headers, ...init }: CallOptions = {}
): Promise<Response> {
  const merged = new Headers(headers);
  if (cookie) merged.set("Cookie", cookie);
  return await app.request(path, { ...init, headers: merged }, peerEnv(peer));
}

function jsonPost(path: string, body: unknown, options: CallOptions = {}) {
  return call(path, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.headers as object) },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response: Response): string {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("orbitdash_session="));
  if (!header) throw new Error("no session cookie");
  return header.split(";")[0];
}

async function signIn(options: CallOptions = {}): Promise<string> {
  const response = await jsonPost("/api/auth/login", { password: PASSWORD }, options);
  expect(response.status).toBe(200);
  return sessionCookie(response);
}

async function readSession(options: CallOptions = {}) {
  const response = await call("/api/auth/session", options);
  expect(response.status).toBe(200);
  return authSessionSchema.parse(await response.json());
}

const PASSWORD_ENV = { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: PASSWORD };
const PROXY_ENV = { ORBITDASH_AUTH: "proxy", ORBITDASH_TRUSTED_PROXIES: `${PROXY_IP}, 10.0.0.3` };

describe("access matrix", () => {
  type Who = "anonymous" | "signed-in" | "trusted proxy" | "untrusted proxy";
  // Statuses for: read, HEAD, change, backup export.
  const matrix: Array<[Record<string, string>, Who, [number, number, number, number]]> = [
    [{}, "anonymous", [200, 200, 201, 200]],
    [PASSWORD_ENV, "anonymous", [401, 401, 401, 401]],
    [PASSWORD_ENV, "signed-in", [200, 200, 201, 200]],
    [{ ...PASSWORD_ENV, ORBITDASH_GUEST: "view" }, "anonymous", [200, 200, 403, 403]],
    [{ ...PASSWORD_ENV, ORBITDASH_GUEST: "view" }, "signed-in", [200, 200, 201, 200]],
    [PROXY_ENV, "anonymous", [401, 401, 401, 401]],
    [PROXY_ENV, "trusted proxy", [200, 200, 201, 200]],
    [PROXY_ENV, "untrusted proxy", [401, 401, 401, 401]],
    [{ ...PROXY_ENV, ORBITDASH_GUEST: "view" }, "untrusted proxy", [200, 200, 403, 403]],
    [{ ...PROXY_ENV, ORBITDASH_GUEST: "view" }, "trusted proxy", [200, 200, 201, 200]],
  ];

  for (const [env, who, [read, head, change, backup]] of matrix) {
    const label = `${env.ORBITDASH_AUTH ?? "none"} mode, guest ${env.ORBITDASH_GUEST ?? "none"}, ${who}`;

    it(label, async () => {
      start(env);
      const options: CallOptions = {};
      if (who === "signed-in") options.cookie = await signIn();
      if (who === "trusted proxy")
        Object.assign(options, { peer: PROXY_IP, headers: { "Remote-User": "chris" } });
      if (who === "untrusted proxy")
        Object.assign(options, { headers: { "Remote-User": "chris" } });

      expect((await call("/api/health", options)).status).toBe(200);
      expect((await call("/api/auth/session", options)).status).toBe(200);
      expect((await call("/api/services", options)).status).toBe(read);
      expect((await call("/api/services", { ...options, method: "HEAD" })).status).toBe(head);
      expect(
        (await jsonPost("/api/categories", { name: crypto.randomUUID() }, options)).status
      ).toBe(change);
      expect((await call("/api/backup/export", options)).status).toBe(backup);
    });
  }
});

describe("protected API", () => {
  it("answers 401 with the auth state, and keeps health checks and unknown paths in line", async () => {
    start(PASSWORD_ENV);

    const response = await call("/api/services");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "sign in required",
      auth: { authenticated: false, canEdit: false, guest: "none", mode: "password", user: null },
    });

    for (const path of [
      "/api/events?topics=config",
      "/api/icons/missing.png",
      "/api/wallpapers/wallpaper-0123456789abcdef.png",
      "/api/system",
      "/api/metrics",
      "/api/metrics/stream",
      "/api/settings",
      "/api/backup/snapshots",
      "/api/nope",
    ]) {
      expect({ path, status: (await call(path)).status }).toEqual({ path, status: 401 });
    }

    expect((await call("/healthz")).status).toBe(200);
    expect((await call("/readyz")).status).toBe(200);
  });

  it("explains guest refusals", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_GUEST: "view" });

    const change = await jsonPost("/api/categories", { name: "Media" });
    expect(await change.json()).toMatchObject({
      error: "sign in to make changes",
      auth: { canEdit: false, guest: "view" },
    });
    const backup = await call("/api/backup/export");
    expect(await backup.json()).toMatchObject({ error: "sign in to use backups" });
  });

  it("lets a guest open the event stream", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_GUEST: "view" });
    const controller = new AbortController();

    const response = await call("/api/events?topics=config", { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });
});

describe("password sign-in", () => {
  it("reports the session state before and after signing in", async () => {
    start(PASSWORD_ENV);

    expect(await readSession()).toEqual({
      authenticated: false,
      canEdit: false,
      guest: "none",
      mode: "password",
      user: null,
    });

    const login = await jsonPost("/api/auth/login", { password: PASSWORD });
    expect(login.headers.get("cache-control")).toBe("no-store");
    expect(await login.json()).toEqual({
      authenticated: true,
      canEdit: true,
      guest: "none",
      mode: "password",
      user: "admin",
    });

    expect(await readSession({ cookie: sessionCookie(login) })).toMatchObject({
      authenticated: true,
      user: "admin",
    });
  });

  it("sets an HttpOnly, SameSite=Lax session cookie for the configured lifetime", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_SESSION_DAYS: "7" });

    const response = await jsonPost("/api/auth/login", { password: PASSWORD });
    const cookie = response.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^orbitdash_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure over HTTPS, or when a trusted proxy says the client used it", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_TRUSTED_PROXIES: PROXY_IP });
    const login = (path: string, options: CallOptions = {}) =>
      jsonPost(path, { password: PASSWORD }, options).then(
        (response) => response.headers.getSetCookie()[0]
      );

    expect(await login("https://dash.home/api/auth/login")).toContain("Secure");
    expect(
      await login("/api/auth/login", { peer: PROXY_IP, headers: { "X-Forwarded-Proto": "https" } })
    ).toContain("Secure");
    expect(
      await login("/api/auth/login", { headers: { "X-Forwarded-Proto": "https" } })
    ).not.toContain("Secure");
    expect(
      await login("/api/auth/login", { peer: PROXY_IP, headers: { "X-Forwarded-Proto": "http" } })
    ).not.toContain("Secure");
  });

  it("refuses a wrong password with a generic message and no cookie", async () => {
    start(PASSWORD_ENV);

    const response = await jsonPost("/api/auth/login", { password: "nope" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "incorrect password" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("validates the request body", async () => {
    start(PASSWORD_ENV);

    expect((await call("/api/auth/login", { method: "POST", body: "password=x" })).status).toBe(
      415
    );
    expect((await jsonPost("/api/auth/login", { password: 42 })).status).toBe(400);
    expect((await jsonPost("/api/auth/login", { password: "x".repeat(1025) })).status).toBe(400);
  });

  it("rate limits failures per client IP, with Retry-After", async () => {
    start(PASSWORD_ENV);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await jsonPost("/api/auth/login", { password: "nope" })).status).toBe(401);
    }

    const limited = await jsonPost("/api/auth/login", { password: PASSWORD });
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(await limited.json()).toEqual({ error: "too many sign-in attempts", retryAfter });

    // A spoofed X-Forwarded-For from an untrusted peer doesn't get a fresh allowance.
    expect(
      (
        await jsonPost(
          "/api/auth/login",
          { password: PASSWORD },
          { headers: { "X-Forwarded-For": "1.2.3.4" } }
        )
      ).status
    ).toBe(429);
    // Another client still can.
    expect(
      (await jsonPost("/api/auth/login", { password: PASSWORD }, { peer: "192.0.2.11" })).status
    ).toBe(200);
  });

  it("keys the rate limit on the forwarded client behind a trusted proxy", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_TRUSTED_PROXIES: PROXY_IP });
    const viaProxy = (client: string) => ({
      peer: PROXY_IP,
      headers: { "X-Forwarded-For": client },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await jsonPost("/api/auth/login", { password: "nope" }, viaProxy("198.51.100.1"));
    }
    expect(
      (await jsonPost("/api/auth/login", { password: PASSWORD }, viaProxy("198.51.100.1"))).status
    ).toBe(429);
    expect(
      (await jsonPost("/api/auth/login", { password: PASSWORD }, viaProxy("198.51.100.2"))).status
    ).toBe(200);
  });

  it("is protected by the same-origin guard", async () => {
    start(PASSWORD_ENV);

    const response = await jsonPost(
      "http://dash.home/api/auth/login",
      { password: PASSWORD },
      { headers: { Host: "dash.home", Origin: "https://evil.example" } }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross-site requests are not allowed" });
  });

  it("isn't available outside password mode", async () => {
    start(PROXY_ENV);
    expect((await jsonPost("/api/auth/login", { password: PASSWORD })).status).toBe(404);
  });

  it("replaces the browser's previous session on a new sign-in", async () => {
    start(PASSWORD_ENV);
    const first = await signIn();

    await signIn({ cookie: first });
    expect((await call("/api/services", { cookie: first })).status).toBe(401);
  });
});

describe("sessions over HTTP", () => {
  it("slides the session and renews the cookie once the refresh interval passes", async () => {
    start(PASSWORD_ENV);
    const cookie = await signIn();

    const fresh = await call("/api/services", { cookie });
    expect(fresh.headers.getSetCookie()).toEqual([]);

    getDb().exec(`UPDATE sessions SET refreshed_at = refreshed_at - ${2 * 60 * 60 * 1000}`);
    const renewed = await call("/api/services", { cookie });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.getSetCookie()[0]).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it("renews the cookie from the session endpoint too", async () => {
    start(PASSWORD_ENV);
    const cookie = await signIn();
    getDb().exec(`UPDATE sessions SET refreshed_at = refreshed_at - ${2 * 60 * 60 * 1000}`);

    const response = await call("/api/auth/session", { cookie });
    expect(response.headers.getSetCookie()[0]).toStartWith(cookie);
  });

  it("drops a cookie whose session has expired", async () => {
    start(PASSWORD_ENV);
    const cookie = await signIn();
    getDb().exec("UPDATE sessions SET expires_at = 0");

    const response = await call("/api/auth/session", { cookie });
    expect(await response.json()).toMatchObject({ authenticated: false });
    expect(response.headers.getSetCookie()[0]).toContain("orbitdash_session=; Max-Age=0");
    expect((await call("/api/services", { cookie })).status).toBe(401);
  });

  it("signs out: deletes the session, clears the cookie and reports what access is left", async () => {
    start({ ...PASSWORD_ENV, ORBITDASH_GUEST: "view" });
    const cookie = await signIn();

    const response = await call("/api/auth/logout", { cookie, method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toContain("orbitdash_session=; Max-Age=0");
    expect(await response.json()).toEqual({
      authenticated: false,
      canEdit: false,
      guest: "view",
      mode: "password",
      user: null,
    });

    expect((await jsonPost("/api/categories", { name: "Media" }, { cookie })).status).toBe(403);
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM sessions").get()).toEqual({ count: 0 });
  });

  it("signs out without a session too", async () => {
    start(PASSWORD_ENV);
    const response = await call("/api/auth/logout", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("ends a session after the password changes", async () => {
    start(PASSWORD_ENV);
    const cookie = await signIn();
    shutdown();
    initializeServer({
      auth: parseAuthConfig({ ...PASSWORD_ENV, ORBITDASH_PASSWORD: "a new password" }),
      dataDir: testDataDir!,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });

    expect((await call("/api/services", { cookie })).status).toBe(401);
  });

  it("closes an open event stream once its session is signed out", async () => {
    start(PASSWORD_ENV);
    const cookie = await signIn();
    jest.useFakeTimers();

    const response = await call("/api/events?topics=config", { cookie });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();

    await call("/api/auth/logout", { cookie, method: "POST" });
    jest.advanceTimersByTime(KEEP_ALIVE_MS);

    let done = false;
    while (!done) ({ done } = await reader.read());
    expect(done).toBe(true);
  });
});

describe("proxy mode", () => {
  it("names the proxy's user in the session", async () => {
    start({ ...PROXY_ENV, ORBITDASH_PROXY_HEADER: "Tailscale-User-Login" });

    expect(
      await readSession({
        peer: PROXY_IP,
        headers: { "Tailscale-User-Login": "chris@example.com" },
      })
    ).toEqual({
      authenticated: true,
      canEdit: true,
      guest: "none",
      mode: "proxy",
      user: "chris@example.com",
    });
    // The default header means nothing once another one is configured.
    expect(
      await readSession({ peer: PROXY_IP, headers: { "Remote-User": "chris" } })
    ).toMatchObject({
      authenticated: false,
    });
  });

  it("ignores the header from anyone but a trusted proxy, whatever X-Forwarded-For says", async () => {
    start(PROXY_ENV);
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    const spoofed = await call("/api/services", {
      headers: { "Remote-User": "chris", "X-Forwarded-For": PROXY_IP },
    });
    expect(spoofed.status).toBe(401);
    // Logged with the peer address, so a wrong ORBITDASH_TRUSTED_PROXIES is easy to spot.
    expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(
      expect.objectContaining({
        event: "auth.proxy_header_ignored",
        header: "remote-user",
        peer: CLIENT_IP,
      })
    );
    warn.mockRestore();
  });

  it("keeps the proxy user signed in on logout", async () => {
    start(PROXY_ENV);
    const response = await call("/api/auth/logout", {
      method: "POST",
      peer: PROXY_IP,
      headers: { "Remote-User": "chris" },
    });
    expect(await response.json()).toMatchObject({ authenticated: true, user: "chris" });
  });
});

describe("no auth", () => {
  it("reports open access", async () => {
    start();
    expect(await readSession()).toEqual({
      authenticated: false,
      canEdit: true,
      guest: "none",
      mode: "none",
      user: null,
    });
  });
});
