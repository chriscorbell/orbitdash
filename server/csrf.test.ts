import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "./app";
import { cleanupTestDatabase, createTestDataDir } from "./test-utils";
import { initializeServer, shutdown } from "./runtime";

let testDataDir: string;

function createServiceForm(): FormData {
  const formData = new FormData();
  formData.set("name", "Orbit");
  formData.set("url", "https://example.com/orbit");
  return formData;
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-csrf-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(testDataDir);
});

describe("cross-site request guard", () => {
  it("rejects mutations with a cross-site Sec-Fetch-Site header", async () => {
    const response = await app.request("/api/services", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site" },
      body: createServiceForm(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "cross-site requests are not allowed",
    });
  });

  it("rejects mutations whose Origin does not match the request host", async () => {
    const response = await app.request("http://dash.home/api/services", {
      method: "POST",
      headers: { Host: "dash.home", Origin: "https://evil.example" },
      body: createServiceForm(),
    });

    expect(response.status).toBe(403);
  });

  it("rejects mutations with an unparseable Origin", async () => {
    const response = await app.request("http://dash.home/api/services", {
      method: "POST",
      headers: { Host: "dash.home", Origin: "null" },
      body: createServiceForm(),
    });

    expect(response.status).toBe(403);
  });

  it("allows same-origin browser mutations", async () => {
    const response = await app.request("http://dash.home/api/services", {
      method: "POST",
      headers: {
        Host: "dash.home",
        Origin: "http://dash.home",
        "Sec-Fetch-Site": "same-origin",
      },
      body: createServiceForm(),
    });

    expect(response.status).toBe(201);
  });

  it("allows header-less clients like curl", async () => {
    const response = await app.request("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Orbit", url: "https://example.com/orbit" }),
    });

    expect(response.status).toBe(201);
  });

  it("leaves safe methods untouched", async () => {
    const response = await app.request("/api/services", {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    });

    expect(response.status).toBe(200);
  });
});
