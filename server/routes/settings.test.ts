import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";

let testDataDir: string;

beforeEach(() => {
  testDataDir = setupTestDatabase("orbitdash-settings-");
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

describe("settings routes", () => {
  it("returns an empty category order when no setting is stored", async () => {
    const response = await app.request("/api/settings/category-order");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ order: [] });
  });

  it("persists a sanitized category order", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: [" Media ", "Infrastructure", "Media", ""] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order: ["Media", "Infrastructure"],
    });

    const getResponse = await app.request("/api/settings/category-order");
    await expect(getResponse.json()).resolves.toEqual({
      order: ["Media", "Infrastructure"],
    });
  });

  it("rejects payloads whose order field is not an array of strings", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: ["Media", 123] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "order must be an array of category names",
    });
  });

  it("rejects attempts to manually order the uncategorized section", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: ["Media", "Uncategorized"] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '"Uncategorized" cannot be manually ordered',
    });
  });

  it("returns a structured error for malformed JSON payloads", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "request body must be valid JSON",
    });
  });

  it("returns a structured error for unsupported content types", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "order=Infra",
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "content-type must be application/json",
    });
  });
});
