import { describe, expect, it } from "vitest";
import {
  notificationChannelCreateSchema,
  notificationChannelSchema,
  notificationChannelUpdateSchema,
  notificationDeliverySchema,
  notificationOptionsSchema,
  notificationsResponseSchema,
  notificationTestResultSchema,
} from "./notification-schemas";
import { DEFAULT_NOTIFICATION_OPTIONS } from "./notifications";

const DISCORD_URL = "https://discord.com/api/webhooks/123/abcdefghijklmnop";

function firstError(result: { success: boolean; error?: { issues: Array<{ message: string }> } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe("channel create schema", () => {
  it("fills defaults for an ntfy channel and normalizes it", () => {
    expect(
      notificationChannelCreateSchema.parse({
        name: "  Phone ",
        type: "ntfy",
        config: { topic: " homelab_alerts ", token: "" },
      })
    ).toEqual({
      name: "Phone",
      events: { status: true, alerts: true },
      type: "ntfy",
      config: {
        server: "https://ntfy.sh",
        topic: "homelab_alerts",
        token: null,
        priority: 4,
        tags: [],
      },
    });

    expect(
      notificationChannelCreateSchema.parse({
        name: "Self-hosted",
        events: { status: true, alerts: false },
        type: "ntfy",
        config: {
          server: "https://ntfy.example.com/",
          topic: "alerts",
          token: "tk_abc",
          priority: 5,
          tags: ["house"],
        },
      }).config
    ).toEqual({
      server: "https://ntfy.example.com",
      topic: "alerts",
      token: "tk_abc",
      priority: 5,
      tags: ["house"],
    });
  });

  it("accepts Gotify, Discord and webhook channels", () => {
    expect(
      notificationChannelCreateSchema.parse({
        name: "Gotify",
        type: "gotify",
        config: { server: "https://push.example.com", token: "Axyz" },
      }).config
    ).toEqual({ server: "https://push.example.com", token: "Axyz", priority: 8 });

    expect(
      notificationChannelCreateSchema.parse({
        name: "Discord",
        type: "discord",
        config: { webhookUrl: DISCORD_URL },
      }).config
    ).toEqual({ webhookUrl: DISCORD_URL });

    expect(
      notificationChannelCreateSchema.parse({
        name: "Home Assistant",
        type: "webhook",
        config: {
          url: "http://ha.lan:8123/api/webhook/abc",
          headers: [{ name: "Authorization", value: "Bearer x" }],
        },
      }).config
    ).toEqual({
      url: "http://ha.lan:8123/api/webhook/abc",
      headers: [{ name: "Authorization", value: "Bearer x" }],
    });
    expect(
      notificationChannelCreateSchema.parse({
        name: "Plain",
        type: "webhook",
        config: { url: "https://hooks.example.com" },
      }).config
    ).toEqual({ url: "https://hooks.example.com", headers: [] });
  });

  it("explains what is wrong", () => {
    const cases: Array<[unknown, string]> = [
      [
        { name: " ", type: "discord", config: { webhookUrl: DISCORD_URL } },
        "channel name is required",
      ],
      [
        { name: "x".repeat(61), type: "discord", config: { webhookUrl: DISCORD_URL } },
        "channel name must be 60 characters or fewer",
      ],
      [
        { name: "A", type: "email", config: {} },
        "type must be one of ntfy, gotify, discord, webhook",
      ],
      [
        { name: "A", type: "ntfy", config: { topic: "has space" } },
        "ntfy topic may use letters, numbers, - and _, up to 64",
      ],
      [
        { name: "A", type: "ntfy", config: { server: "https://n.example/?x=1", topic: "t" } },
        "ntfy server must be an http(s) URL without a password, query or fragment",
      ],
      [
        { name: "A", type: "ntfy", config: { topic: "t", tags: ["a,b"] } },
        "ntfy tags can't contain commas",
      ],
      [
        { name: "A", type: "ntfy", config: { topic: "t", tags: ["a", "b", "c", "d", "e", "f"] } },
        "at most 5 ntfy tags",
      ],
      [
        { name: "A", type: "ntfy", config: { topic: "t", token: "x".repeat(513) } },
        "token is too long",
      ],
      [
        { name: "A", type: "gotify", config: { server: "https://g.example", token: " " } },
        "Gotify app token is required",
      ],
      [
        { name: "A", type: "gotify", config: { server: "https://g.example", token: "a b" } },
        "token can't contain spaces",
      ],
      [
        {
          name: "A",
          type: "gotify",
          config: { server: "https://g.example", token: "x".repeat(513) },
        },
        "token is too long",
      ],
      [
        { name: "A", type: "discord", config: { webhookUrl: "https://example.com/hook" } },
        "Discord webhook URL must look like https://discord.com/api/webhooks/…",
      ],
      [
        { name: "A", type: "webhook", config: { url: "https://u:p@hooks.example" } },
        "webhook URL must be an http(s) URL without a password",
      ],
      [
        {
          name: "A",
          type: "webhook",
          config: { url: "https://h.example", headers: [{ name: "Bad Name", value: "x" }] },
        },
        "header names may only use letters, digits and - _ . !",
      ],
      [
        {
          name: "A",
          type: "webhook",
          config: { url: "https://h.example", headers: [{ name: "Host", value: "x" }] },
        },
        "that header is set for you",
      ],
      [
        {
          name: "A",
          type: "webhook",
          config: { url: "https://h.example", headers: [{ name: "X-A", value: "a\r\nb" }] },
        },
        "header value is not allowed",
      ],
      [
        {
          name: "A",
          type: "webhook",
          config: {
            url: "https://h.example",
            headers: [
              { name: "X-A", value: "1" },
              { name: "x-a", value: "2" },
            ],
          },
        },
        "each header can appear only once",
      ],
      [
        {
          name: "A",
          type: "webhook",
          config: {
            url: "https://h.example",
            headers: Array.from({ length: 11 }, (_, index) => ({ name: `X-${index}`, value: "1" })),
          },
        },
        "at most 10 headers",
      ],
    ];
    for (const [input, message] of cases) {
      expect(firstError(notificationChannelCreateSchema.safeParse(input))).toBe(message);
    }
  });
});

describe("channel update schema", () => {
  it("lets secrets be left out or sent back masked", () => {
    expect(
      notificationChannelUpdateSchema.parse({
        name: "Phone",
        type: "ntfy",
        config: { topic: "••••erts", token: "••••" },
      }).config
    ).toEqual({ server: "https://ntfy.sh", priority: 4, tags: [] });

    expect(
      notificationChannelUpdateSchema.parse({
        name: "Phone",
        type: "ntfy",
        config: { token: null },
      }).config
    ).toEqual({ server: "https://ntfy.sh", token: null, priority: 4, tags: [] });

    expect(
      notificationChannelUpdateSchema.parse({
        name: "G",
        type: "gotify",
        config: { server: "https://g.example" },
      }).config
    ).toEqual({ server: "https://g.example", priority: 8 });

    expect(
      notificationChannelUpdateSchema.parse({
        name: "D",
        type: "discord",
        config: { webhookUrl: "https://discord.com/••••mnop" },
      }).config
    ).toEqual({});

    expect(
      notificationChannelUpdateSchema.parse({
        name: "W",
        type: "webhook",
        config: { headers: [{ name: "Authorization" }, { name: "X-New", value: "1" }] },
      }).config
    ).toEqual({ headers: [{ name: "Authorization" }, { name: "X-New", value: "1" }] });
    expect(
      notificationChannelUpdateSchema.parse({ name: "W", type: "webhook", config: {} }).config
    ).toEqual({ headers: [] });
  });

  it("still validates secrets that are given", () => {
    expect(
      firstError(
        notificationChannelUpdateSchema.safeParse({
          name: "Phone",
          type: "ntfy",
          config: { topic: "no spaces allowed" },
        })
      )
    ).toBe("ntfy topic may use letters, numbers, - and _, up to 64");
    expect(
      notificationChannelUpdateSchema.safeParse({
        name: "W",
        type: "webhook",
        config: { headers: [{ name: "A" }, { name: "a" }] },
      }).success
    ).toBe(false);
  });
});

describe("notification options schema", () => {
  it("accepts the defaults and a configured zone", () => {
    expect(notificationOptionsSchema.parse(DEFAULT_NOTIFICATION_OPTIONS)).toEqual(
      DEFAULT_NOTIFICATION_OPTIONS
    );
    const options = {
      downDelayMinutes: 0,
      quietHours: { enabled: true, start: "23:00", end: "06:30" },
      timeZone: "Europe/Berlin",
    };
    expect(notificationOptionsSchema.parse(options)).toEqual(options);
  });

  it("rejects delays, times and zones it doesn't know", () => {
    const cases: Array<[unknown, string]> = [
      [
        { ...DEFAULT_NOTIFICATION_OPTIONS, downDelayMinutes: 3 },
        "delay is not one of the allowed choices",
      ],
      [
        {
          ...DEFAULT_NOTIFICATION_OPTIONS,
          quietHours: { enabled: true, start: "7", end: "08:00" },
        },
        "times must look like 22:00",
      ],
      [
        {
          ...DEFAULT_NOTIFICATION_OPTIONS,
          quietHours: { enabled: true, start: "08:00", end: "08:00" },
        },
        "quiet hours must start and end at different times",
      ],
      [
        { ...DEFAULT_NOTIFICATION_OPTIONS, timeZone: "Mars/Base" },
        "time zone must be an IANA name like Europe/Berlin",
      ],
    ];
    for (const [input, message] of cases) {
      expect(firstError(notificationOptionsSchema.safeParse(input))).toBe(message);
    }
    expect(
      notificationOptionsSchema.safeParse({ ...DEFAULT_NOTIFICATION_OPTIONS, extra: 1 }).success
    ).toBe(false);
  });
});

describe("notification response schemas", () => {
  const delivery = {
    id: 1,
    channelId: "c1",
    channelName: "Phone",
    channelType: "ntfy",
    event: "service.down",
    title: "Jellyfin is down",
    ok: false,
    attempts: 3,
    error: "HTTP 502",
    sentAt: 5,
  };

  it("parse channels of every type, deliveries and test results", () => {
    const base = {
      id: "c",
      name: "N",
      events: { status: true, alerts: false },
      createdAt: 1,
      updatedAt: 2,
    };
    const channels = [
      {
        ...base,
        type: "ntfy",
        config: { server: "https://ntfy.sh", topic: "••••", token: null, priority: 4, tags: [] },
      },
      { ...base, type: "gotify", config: { server: "https://g", token: "••••", priority: 8 } },
      { ...base, type: "discord", config: { webhookUrl: "https://discord.com/••••" } },
      {
        ...base,
        type: "webhook",
        config: { url: "https://h/••••", headers: [{ name: "A", value: "••••" }] },
      },
    ];
    for (const channel of channels) {
      expect(notificationChannelSchema.parse(channel)).toEqual(channel);
    }
    const response = {
      channels,
      options: DEFAULT_NOTIFICATION_OPTIONS,
      deliveries: [delivery],
      serverTimeZone: "UTC",
    };
    expect(notificationsResponseSchema.parse(response)).toEqual(response);
    expect(notificationDeliverySchema.safeParse({ ...delivery, event: "other" }).success).toBe(
      false
    );
    expect(notificationTestResultSchema.parse({ ok: true, error: null, delivery: null })).toEqual({
      ok: true,
      error: null,
      delivery: null,
    });
  });
});
