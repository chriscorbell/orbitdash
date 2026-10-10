import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Service } from "@shared/types";
import { app } from "../app";
import { getDb } from "../db";
import { initializeServer, shutdown } from "../runtime";
import type { BackupDocument } from "../services/backup-transfer";
import { unknownStatus } from "../status/state";
import { recordCheckResult } from "../status/store";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";

let testDataDir: string;

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-service-checks-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(testDataDir);
});

function postJson(path: string, body: unknown, method = "POST") {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createService(body: Record<string, unknown> = {}): Promise<Service> {
  const response = await postJson("/api/services", {
    name: "Jellyfin",
    url: "http://media.lan:8096/",
    ...body,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function updateService(id: string, body: Record<string, unknown>) {
  return postJson(`/api/services/${id}`, body, "PUT");
}

describe("service check settings", () => {
  it("are off with sensible defaults unless asked for", async () => {
    expect(await createService()).toMatchObject({
      check_enabled: false,
      check_method: "http",
      check_target: null,
      check_interval: 60,
      check_ignore_tls: false,
    });
  });

  it("are saved from JSON and multipart requests, with targets normalized", async () => {
    expect(
      await createService({
        check_enabled: true,
        check_method: "tcp",
        check_target: " Media.LAN:22 ",
        check_interval: 300,
      })
    ).toMatchObject({
      check_enabled: true,
      check_method: "tcp",
      check_target: "media.lan:22",
      check_interval: 300,
    });

    const formData = new FormData();
    formData.set("name", "Proxmox");
    formData.set("url", "https://pve.lan:8006");
    formData.set("check_enabled", "true");
    formData.set("check_target", "pve.lan:8006/api2/json/version");
    formData.set("check_interval", "15");
    formData.set("check_ignore_tls", "true");
    const response = await app.request("/api/services", { method: "POST", body: formData });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      check_enabled: true,
      check_method: "http",
      check_target: "http://pve.lan:8006/api2/json/version",
      check_interval: 15,
      check_ignore_tls: true,
    });
  });

  it("reject settings that could never work", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ check_interval: 5 }, "check interval must be a whole number of seconds from 15 to 3600"],
      [
        { check_interval: 90.5 },
        "check interval must be a whole number of seconds from 15 to 3600",
      ],
      [{ check_method: "icmp" }, "check method must be http or tcp"],
      [
        { check_method: "tcp", check_target: "nas.lan" },
        "check address must be a host and port, like nas.lan:22",
      ],
      [{ check_target: "ftp://nas.lan/" }, "check url must be a valid URL"],
      [{ check_enabled: "yes" }, "check_enabled must be true or false"],
    ];

    for (const [body, error] of cases) {
      const response = await postJson("/api/services", {
        name: "Bad",
        url: "http://nas.lan/",
        ...body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }

    const formData = new FormData();
    formData.set("name", "Bad");
    formData.set("url", "http://nas.lan/");
    formData.set("check_interval", "soon");
    const response = await app.request("/api/services", { method: "POST", body: formData });
    expect(response.status).toBe(400);
  });

  it("update partially, and switching method drops a target meant for the other one", async () => {
    const service = await createService({ check_target: "http://media.lan:8096/health" });

    const toggled = await updateService(service.id, { check_enabled: true });
    expect(await toggled.json()).toMatchObject({
      check_enabled: true,
      check_target: "http://media.lan:8096/health",
    });

    const switched = await updateService(service.id, { check_method: "tcp" });
    expect(await switched.json()).toMatchObject({ check_method: "tcp", check_target: null });

    const invalid = await updateService(service.id, { check_target: "not a host" });
    expect(invalid.status).toBe(400);

    const cleared = await updateService(service.id, { check_target: "", check_interval: 3600 });
    expect(await cleared.json()).toMatchObject({ check_target: null, check_interval: 3600 });
  });

  it("are copied by duplicate and come back with a restored service", async () => {
    const service = await createService({ check_enabled: true, check_interval: 30 });

    const duplicate = (await (
      await app.request(`/api/services/${service.id}/duplicate`, { method: "POST" })
    ).json()) as Service;
    expect(duplicate).toMatchObject({ check_enabled: true, check_interval: 30 });

    expect((await app.request(`/api/services/${service.id}`, { method: "DELETE" })).status).toBe(
      200
    );
    const restored = (await (
      await app.request(`/api/services/${service.id}/restore`, { method: "POST" })
    ).json()) as Service;
    expect(restored).toMatchObject({ check_enabled: true, check_interval: 30 });
  });
});

describe("backups with status checks", () => {
  async function exportDocument(): Promise<BackupDocument> {
    return (await (await app.request("/api/backup/export")).json()) as BackupDocument;
  }

  it("round-trip check settings but leave check history in place", async () => {
    const service = await createService({
      check_enabled: true,
      check_method: "tcp",
      check_target: "media.lan:8096",
      check_interval: 120,
    });
    const status = unknownStatus(service.id, "tcp media.lan:8096");
    recordCheckResult(
      getDb(),
      status,
      { ok: true, latencyMs: 3, statusCode: null, error: null },
      5
    );

    const document = await exportDocument();
    expect(document.services[0]).toMatchObject({
      check_enabled: true,
      check_method: "tcp",
      check_target: "media.lan:8096",
      check_interval: 120,
      check_ignore_tls: false,
    });
    expect(JSON.stringify(document)).not.toContain("status_results");

    expect((await postJson("/api/backup/import", document)).status).toBe(200);
    expect((await exportDocument()).services).toEqual(document.services);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM status_results").get()).toEqual({ n: 1 });
  });

  it("import older backups without check settings with checks off", async () => {
    await createService();
    const document = await exportDocument();
    const legacy = {
      ...document,
      services: document.services.map(
        ({
          check_enabled: _enabled,
          check_method: _method,
          check_target: _target,
          check_interval: _interval,
          check_ignore_tls: _ignoreTls,
          ...service
        }) => service
      ),
    };

    expect((await postJson("/api/backup/import", legacy)).status).toBe(200);
    const [service] = (await (await app.request("/api/services")).json()) as Service[];
    expect(service).toMatchObject({
      check_enabled: false,
      check_method: "http",
      check_target: null,
      check_interval: 60,
    });
  });

  it("reject a check target that doesn't suit its method", async () => {
    await createService();
    const document = await exportDocument();
    document.services[0] = {
      ...document.services[0],
      check_method: "tcp",
      check_target: "https://media.lan/",
    };

    const response = await postJson("/api/backup/import", document);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Jellyfin: check address must be a host and port, like nas.lan:22",
    });
  });
});
