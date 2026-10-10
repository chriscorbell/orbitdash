import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";

let dataDir: string;
let target: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  // A stand-in service to inspect and check.
  target = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/broken") return new Response("down", { status: 503 });
      return new Response(
        '<title>Home - Jellyfin</title><link rel="icon" href="/web/favicon.png">',
        { headers: { "content-type": "text/html" } }
      );
    },
  });
});

afterAll(() => target.stop(true));

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-service-tools-");
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(dataDir);
});

function post(path: string, body: unknown) {
  return app.request(`/api/service-tools/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("service tools", () => {
  it("inspects a link, normalizing it first", async () => {
    const response = await post("inspect", { url: `127.0.0.1:${target.port}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: `http://127.0.0.1:${target.port}/`,
      reachable: true,
      error: null,
      name: "Jellyfin",
      iconUrl: `http://127.0.0.1:${target.port}/web/favicon.png`,
      selfSigned: false,
    });
    expect((await post("inspect", { url: "ftp://x" })).status).toBe(400);
    expect((await post("inspect", {})).status).toBe(400);
  });

  it("runs one HTTP or TCP check with the form's settings", async () => {
    const base = `http://127.0.0.1:${target.port}`;
    expect(await (await post("test", { url: base })).json()).toMatchObject({
      target: `${base}/`,
      state: "up",
      statusCode: 200,
      error: null,
    });
    expect(
      await (await post("test", { url: base, check_target: `${base}/broken` })).json()
    ).toMatchObject({ state: "down", statusCode: 503, error: "HTTP 503" });
    expect(
      await (await post("test", { url: base, check_method: "tcp", check_target: null })).json()
    ).toMatchObject({ target: `127.0.0.1:${target.port}`, state: "up" });
  });

  it("explains targets it can't use", async () => {
    const tcp = await post("test", {
      url: "http://x.lan",
      check_method: "tcp",
      check_target: "nope",
    });
    expect(tcp.status).toBe(400);
    expect(await tcp.json()).toEqual({ error: "check target must be host:port" });
    expect((await post("test", { url: "ftp://x" })).status).toBe(400);
  });
});
