import { describe, expect, it } from "bun:test";
import { buildChannelRequest, webhookPayload } from "./channels";
import {
  serviceDownMessage,
  serviceRecoveredMessage,
  summaryMessage,
  testMessage,
  alertFiringMessage,
} from "./messages";
import {
  alert,
  discordChannel,
  DISCORD_URL,
  gotifyChannel,
  ntfyChannel,
  webhookChannel,
} from "./test-fixtures";

const ctx = { now: Date.UTC(2026, 9, 10, 14, 30), timeZone: "UTC" };
const service = { id: "svc", name: "Jellyfin", url: "http://10.0.0.20:8096/" };
const down = serviceDownMessage(service, Date.UTC(2026, 9, 10, 14, 2), "Connection refused", ctx);
const up = serviceRecoveredMessage(
  service,
  Date.UTC(2026, 9, 10, 14, 2),
  Date.UTC(2026, 9, 10, 14, 14),
  ctx
);

describe("buildChannelRequest", () => {
  it("publishes to ntfy as JSON with the token, priority and tags", () => {
    const request = buildChannelRequest(ntfyChannel, down, "Homelab");
    expect(request.url).toBe("https://ntfy.example.com/");
    expect(request.headers).toEqual({
      "Content-Type": "application/json",
      "User-Agent": "orbitdash",
      Authorization: "Bearer tk_secret",
    });
    expect(JSON.parse(request.body)).toEqual({
      topic: "homelab",
      title: "Jellyfin is down",
      message: "Connection refused. Down since 14:02.",
      priority: 4,
      tags: ["rotating_light", "house"],
      click: service.url,
    });

    // Recoveries don't go above ntfy's default priority; no token means no header.
    const open = { ...ntfyChannel, config: { ...ntfyChannel.config, token: null, priority: 5 } };
    const recovery = buildChannelRequest(open as typeof ntfyChannel, up, "Homelab");
    expect(recovery.headers.Authorization).toBeUndefined();
    expect(JSON.parse(recovery.body)).toMatchObject({
      priority: 3,
      tags: ["white_check_mark", "house"],
    });
    expect(
      JSON.parse(buildChannelRequest(ntfyChannel, testMessage("x", ctx), "x").body)
    ).not.toHaveProperty("click");
  });

  it("posts Gotify messages with the app token in a header", () => {
    const request = buildChannelRequest(gotifyChannel, down, "Homelab");
    expect(request.url).toBe("https://push.example.com/gotify/message");
    expect(request.headers["X-Gotify-Key"]).toBe("Agotify");
    expect(JSON.parse(request.body)).toEqual({
      title: "Jellyfin is down",
      message: "Connection refused. Down since 14:02.",
      priority: 8,
      extras: {
        "client::display": { contentType: "text/plain" },
        "client::notification": { click: { url: service.url } },
      },
    });
    expect(JSON.parse(buildChannelRequest(gotifyChannel, up, "Homelab").body).priority).toBe(5);
    expect(
      JSON.parse(buildChannelRequest(gotifyChannel, testMessage("x", ctx), "x").body).extras
    ).toEqual({ "client::display": { contentType: "text/plain" } });
  });

  it("sends Discord an embed colored by severity, with mentions off", () => {
    const request = buildChannelRequest(discordChannel, down, "Homelab");
    expect(request.url).toBe(DISCORD_URL);
    expect(JSON.parse(request.body)).toEqual({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "Jellyfin is down",
          description: "Connection refused. Down since 14:02.",
          color: 0xef4444,
          timestamp: "2026-10-10T14:30:00.000Z",
          footer: { text: "Homelab" },
          url: service.url,
        },
      ],
    });
    const colors = [up, alertFiringMessage(alert(), ctx), testMessage("x", ctx)].map(
      (message) =>
        JSON.parse(buildChannelRequest(discordChannel, message, "x").body).embeds[0].color
    );
    expect(colors).toEqual([0x22c55e, 0xf59e0b, 0x3b82f6]);
  });

  it("posts the documented payload to a webhook with its headers", () => {
    const request = buildChannelRequest(webhookChannel, down, "Homelab");
    expect(request.url).toBe("https://hooks.example.com/notify?token=abc");
    expect(request.headers).toEqual({
      "Content-Type": "application/json",
      "User-Agent": "orbitdash",
      Authorization: "Bearer xyz",
    });
    expect(JSON.parse(request.body)).toEqual({
      version: 1,
      source: "Homelab",
      timestamp: "2026-10-10T14:30:00.000Z",
      event: "service.down",
      severity: "critical",
      title: "Jellyfin is down",
      message: "Connection refused. Down since 14:02.",
      service: {
        id: "svc",
        name: "Jellyfin",
        url: service.url,
        error: "Connection refused",
        downSince: "2026-10-10T14:02:00.000Z",
        recoveredAt: null,
        downtimeSeconds: null,
      },
      alert: null,
      items: [],
    });
  });
});

describe("webhookPayload", () => {
  it("describes recoveries, alerts and summaries", () => {
    expect(webhookPayload(up, "x").service).toMatchObject({
      recoveredAt: "2026-10-10T14:14:00.000Z",
      downtimeSeconds: 720,
    });
    expect(webhookPayload(alertFiringMessage(alert(), ctx), "x").alert).toEqual({
      id: "a1",
      metric: "cpu",
      subject: null,
      threshold: 90,
      durationSeconds: 300,
      value: 97,
      peak: 98,
      startedAt: "1970-01-01T00:00:00.000Z",
      firedAt: "1970-01-01T00:05:00.000Z",
      resolvedAt: null,
    });
    const summary = webhookPayload(summaryMessage([{ kind: "alerts", alert: alert() }], ctx), "x");
    expect(summary).toMatchObject({ event: "summary", service: null, alert: null });
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({ event: "alert.firing", alert: { id: "a1" } });
  });
});
