import { afterEach, beforeEach, describe, expect, it, spyOn, type Mock } from "bun:test";
import { DEFAULT_NOTIFICATION_OPTIONS } from "@shared/notifications";
import type { ServerEvent } from "@shared/events";
import type {
  NotificationChannel,
  NotificationsResponse,
  NotificationTestResult,
} from "@shared/types";
import { app } from "../app";
import { parseAuthConfig } from "../auth/config";
import { getDb } from "../db";
import { publish, subscribeEvents } from "../events";
import { notifications } from "../notifications/service";
import { readChannels, writeChannels } from "../notifications/store";
import { DISCORD_URL, ntfyChannel, webhookChannel } from "../notifications/test-fixtures";
import { initializeServer, shutdown } from "../runtime";
import { exportBackup, importBackup } from "../services/backup-transfer";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";

let dataDir: string;
let fetchMock: Mock<typeof fetch>;

const NTFY_INPUT = {
  name: "Phone",
  type: "ntfy",
  config: { topic: "homelab-alerts", token: "tk_supersecret1234" },
};

function start(auth?: Record<string, string>) {
  dataDir = createTestDataDir("orbitdash-notifications-");
  initializeServer({
    ...(auth ? { auth: parseAuthConfig(auth) } : {}),
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
}

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function read(): Promise<NotificationsResponse> {
  return (await (await app.request("/api/notifications")).json()) as NotificationsResponse;
}

async function createNtfy(input: unknown = NTFY_INPUT): Promise<NotificationChannel> {
  const response = await send("POST", "/api/notifications/channels", input);
  expect(response.status).toBe(201);
  return ((await response.json()) as { channel: NotificationChannel }).channel;
}

/** Bun's fetch type carries extras (preconnect) a stand-in doesn't need. */
const asFetch = (fn: () => Promise<Response>) => fn as unknown as typeof fetch;

function answer(status: number, body: unknown = null) {
  fetchMock.mockImplementation(
    asFetch(async () =>
      body === null
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status })
    )
  );
}

beforeEach(() => {
  // Nothing here may reach the network.
  fetchMock = spyOn(globalThis, "fetch").mockImplementation(
    asFetch(async () => {
      throw new Error("unexpected fetch");
    })
  );
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(dataDir);
  fetchMock.mockRestore();
  (console.log as unknown as Mock<typeof console.log>).mockRestore();
  (console.warn as unknown as Mock<typeof console.warn>).mockRestore();
});

describe("notification channels", () => {
  beforeEach(() => start());

  it("starts empty with the default options", async () => {
    const body = await read();
    expect(body.channels).toEqual([]);
    expect(body.options).toEqual(DEFAULT_NOTIFICATION_OPTIONS);
    expect(body.deliveries).toEqual([]);
    expect(typeof body.serverTimeZone).toBe("string");
  });

  it("stores secrets on the server and only ever returns masks", async () => {
    const created = await createNtfy();
    expect(created.config).toEqual({
      server: "https://ntfy.sh",
      topic: "••••erts",
      token: "••••1234",
      priority: 4,
      tags: [],
    });

    const text = await (await app.request("/api/notifications")).text();
    expect(text).not.toContain("homelab-alerts");
    expect(text).not.toContain("tk_supersecret1234");
    expect(readChannels(getDb())[0].config).toMatchObject({
      topic: "homelab-alerts",
      token: "tk_supersecret1234",
    });
  });

  it("keeps secrets an update leaves out or sends back masked", async () => {
    const created = await createNtfy();
    const response = await send("PUT", `/api/notifications/channels/${created.id}`, {
      ...NTFY_INPUT,
      name: "Phone (quiet)",
      events: { status: true, alerts: false },
      config: { topic: "••••erts", priority: 2 },
    });
    expect(response.status).toBe(200);
    const { channel } = (await response.json()) as { channel: NotificationChannel };
    expect(channel).toMatchObject({ name: "Phone (quiet)", events: { alerts: false } });
    expect(readChannels(getDb())[0].config).toMatchObject({
      topic: "homelab-alerts",
      token: "tk_supersecret1234",
      priority: 2,
    });
  });

  it("rejects bad input, unknown channels and type changes", async () => {
    const created = await createNtfy();
    expect(
      (await send("POST", "/api/notifications/channels", { name: "x", type: "sms" })).status
    ).toBe(400);
    const missing = await send("PUT", "/api/notifications/channels/nope", NTFY_INPUT);
    expect(missing.status).toBe(404);
    const retyped = await send("PUT", `/api/notifications/channels/${created.id}`, {
      name: "x",
      type: "discord",
      config: { webhookUrl: DISCORD_URL },
    });
    expect(retyped.status).toBe(400);
    expect(await retyped.json()).toEqual({ error: "a channel's type can't be changed" });
  });

  it("deletes channels", async () => {
    const created = await createNtfy();
    expect((await send("DELETE", `/api/notifications/channels/${created.id}`)).status).toBe(200);
    expect((await read()).channels).toEqual([]);
    expect((await send("DELETE", `/api/notifications/channels/${created.id}`)).status).toBe(404);
  });

  it("allows at most 20 channels", async () => {
    writeChannels(
      getDb(),
      Array.from({ length: 20 }, (_, index) => ({ ...ntfyChannel, id: `c${index}` }))
    );
    const response = await send("POST", "/api/notifications/channels", NTFY_INPUT);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "at most 20 channels" });
  });

  it("saves options and validates them", async () => {
    const options = {
      downDelayMinutes: 5,
      quietHours: { enabled: true, start: "23:00", end: "07:00" },
      timeZone: "Europe/Berlin",
    };
    const response = await send("PUT", "/api/notifications/options", options);
    expect(await response.json()).toEqual({ options });
    expect((await read()).options).toEqual(options);
    expect(
      (await send("PUT", "/api/notifications/options", { ...options, timeZone: "Nope/No" })).status
    ).toBe(400);
  });

  it("tells other tabs about changes, but not about tests", async () => {
    const events: ServerEvent[] = [];
    const stop = subscribeEvents(["config"], (event) => events.push(event));
    const created = await createNtfy();
    answer(204);
    await send("POST", `/api/notifications/channels/${created.id}/test`);
    stop();
    expect(events).toEqual([{ type: "config.changed", scope: "settings", origin: null }]);
  });

  it("puts channels with their secrets in backups and restores them", async () => {
    await createNtfy();
    const backup = exportBackup();
    expect(backup.settings["notifications.channels"]).toContain("tk_supersecret1234");

    writeChannels(getDb(), []);
    expect(importBackup(backup).success).toBe(true);
    expect(readChannels(getDb())[0].config).toMatchObject({ token: "tk_supersecret1234" });
  });

  it("skips damaged stored channels", async () => {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('notifications.channels', ?)")
      .run(JSON.stringify([{ id: "broken" }, webhookChannel]));
    expect((await read()).channels.map((channel) => channel.id)).toEqual(["webhook"]);
    getDb()
      .prepare("UPDATE settings SET value = '{bad' WHERE key = 'notifications.channels'")
      .run();
    expect((await read()).channels).toEqual([]);
  });
});

describe("test messages", () => {
  beforeEach(() => start());

  it("sends a test to a saved channel and logs it", async () => {
    const created = await createNtfy();
    answer(200, { id: "x" });
    const response = await send("POST", `/api/notifications/channels/${created.id}/test`);
    const result = (await response.json()) as NotificationTestResult;
    expect(result).toMatchObject({ ok: true, error: null, delivery: { event: "test", ok: true } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ntfy.sh/");
    expect(JSON.parse(String(init.body))).toMatchObject({
      topic: "homelab-alerts",
      title: "Test notification",
      message: "orbitdash can reach you here.",
    });
    expect((await read()).deliveries).toEqual([
      expect.objectContaining({
        channelId: created.id,
        channelName: "Phone",
        ok: true,
        attempts: 1,
      }),
    ]);
  });

  it("reports failures with the receiver's explanation, once, without retrying", async () => {
    const created = await createNtfy();
    answer(401, { error: "unauthorized", http: 401 });
    const result = (await (
      await send("POST", `/api/notifications/channels/${created.id}/test`)
    ).json()) as NotificationTestResult;
    expect(result).toMatchObject({ ok: false, error: "HTTP 401: unauthorized" });
    expect(result.delivery).toMatchObject({ ok: false, error: "HTTP 401" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tests unsaved edits over a saved channel without saving them", async () => {
    const created = await createNtfy();
    answer(200, {});
    const response = await send("POST", `/api/notifications/channels/${created.id}/test`, {
      ...NTFY_INPUT,
      config: { server: "https://ntfy.example.com", topic: "other" },
    });
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ntfy.example.com/");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tk_supersecret1234");
    expect(readChannels(getDb())[0].config).toMatchObject({ server: "https://ntfy.sh" });

    const bad = await send("POST", `/api/notifications/channels/${created.id}/test`, {
      name: "x",
      type: "ntfy",
      config: { topic: "no spaces" },
    });
    expect(bad.status).toBe(400);
    const retyped = await send("POST", `/api/notifications/channels/${created.id}/test`, {
      name: "x",
      type: "discord",
      config: {},
    });
    expect(retyped.status).toBe(400);
    const notJson = await app.request(`/api/notifications/channels/${created.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hi",
    });
    expect(notJson.status).toBe(415);
    expect((await send("POST", "/api/notifications/channels/nope/test")).status).toBe(404);
  });

  it("tests a channel that isn't saved yet without logging it", async () => {
    answer(204);
    const response = await send("POST", "/api/notifications/test", {
      name: "Discord",
      type: "discord",
      config: { webhookUrl: DISCORD_URL },
    });
    expect(await response.json()).toEqual({ ok: true, error: null, delivery: null });
    expect(fetchMock.mock.calls[0][0]).toBe(DISCORD_URL);
    expect((await read()).deliveries).toEqual([]);
    expect((await send("POST", "/api/notifications/test", { name: "x" })).status).toBe(400);
  });
});

describe("notifications from events", () => {
  beforeEach(() => {
    start();
    getDb()
      .prepare(
        `INSERT INTO services (id, name, url, open_in_new_tab, created_at, updated_at)
         VALUES ('svc', 'Jellyfin', 'http://jf.lan/', 1, 0, 0)`
      )
      .run();
  });

  it("sends status changes and alerts to the channels that want them", async () => {
    await createNtfy();
    await createNtfy({
      name: "Alerts only",
      type: "webhook",
      events: { status: false, alerts: true },
      config: { url: "https://hooks.example/x" },
    });
    await send("PUT", "/api/notifications/options", {
      ...DEFAULT_NOTIFICATION_OPTIONS,
      downDelayMinutes: 0,
    });
    answer(200, {});
    notifications.start();
    expect(notifications.isRunning()).toBe(true);

    const now = Date.now();
    const base = { latencyMs: null, statusCode: null, checkedAt: now };
    publish({
      type: "status",
      id: "svc",
      status: { ...base, id: "svc", state: "down", error: "HTTP 502", changedAt: now },
    });
    publish({
      type: "alert",
      alert: {
        id: "a1",
        metric: "cpu",
        subject: null,
        threshold: 90,
        durationSec: 0,
        value: 95,
        peak: 95,
        startedAt: now,
        firedAt: now,
        resolvedAt: null,
      },
    });
    await notifications.idle();

    // Each channel gets its messages in order; channels run side by side.
    const sentTo = (target: string) =>
      fetchMock.mock.calls
        .filter(([url]) => String(url) === target)
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)).title);
    expect(sentTo("https://ntfy.sh/")).toEqual(["Jellyfin is down", "CPU above 90%"]);
    expect(sentTo("https://hooks.example/x")).toEqual(["CPU above 90%"]);
    const deliveries = (await read()).deliveries;
    expect(
      deliveries.map((delivery) => `${delivery.channelName}: ${delivery.event}`).sort()
    ).toEqual(["Alerts only: alert.firing", "Phone: alert.firing", "Phone: service.down"]);

    notifications.tick();
    notifications.stop();
    expect(notifications.isRunning()).toBe(false);
  });

  it("logs a delivery the receiver refused", async () => {
    await createNtfy();
    await send("PUT", "/api/notifications/options", {
      ...DEFAULT_NOTIFICATION_OPTIONS,
      downDelayMinutes: 0,
    });
    answer(400, { error: "invalid topic" });
    notifications.start();
    const now = Date.now();
    publish({
      type: "status",
      id: "svc",
      status: {
        id: "svc",
        state: "down",
        latencyMs: null,
        statusCode: null,
        error: null,
        checkedAt: now,
        changedAt: now,
      },
    });
    await notifications.idle();
    expect((await read()).deliveries[0]).toMatchObject({
      ok: false,
      error: "HTTP 400",
      attempts: 1,
    });
  });
});

describe("guests", () => {
  it("can read channels, masked, and can't change or test them", async () => {
    start({ ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: "pw", ORBITDASH_GUEST: "view" });
    writeChannels(getDb(), [ntfyChannel, webhookChannel]);
    const peer = { requestIP: () => ({ address: "192.0.2.1", family: "IPv4", port: 1 }) };

    const response = await app.request("/api/notifications", {}, peer);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const secret of ["homelab", "tk_secret", "token=abc", "Bearer xyz"]) {
      expect(text).not.toContain(secret);
    }

    const test = await app.request(
      "/api/notifications/channels/ntfy/test",
      { method: "POST" },
      peer
    );
    expect(test.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
