import { describe, expect, it } from "bun:test";
import {
  notificationChannelCreateSchema,
  notificationChannelUpdateSchema,
} from "@shared/notification-schemas";
import type { NotificationChannel } from "@shared/types";
import {
  applyChannelUpdate,
  createChannel,
  maskSecret,
  maskUrl,
  toChannelView,
} from "./channel-config";

const DISCORD_URL = "https://discord.com/api/webhooks/123/abcdefghijklmnopWXYZ";

function make(input: unknown): NotificationChannel {
  return createChannel(notificationChannelCreateSchema.parse(input), "c1", 1_000);
}

function update(stored: NotificationChannel, input: unknown, now = 2_000) {
  return applyChannelUpdate(stored, notificationChannelUpdateSchema.parse(input), now);
}

describe("masking", () => {
  it("shows the last four characters of long secrets only", () => {
    expect(maskSecret("tk_abcdefghijkl1234")).toBe("••••1234");
    expect(maskSecret("short")).toBe("••••");
  });

  it("keeps a URL's origin and masks the rest", () => {
    expect(maskUrl(DISCORD_URL)).toBe("https://discord.com/••••WXYZ");
    expect(maskUrl("http://hooks.lan:8080/")).toBe("http://hooks.lan:8080/••••");
    expect(maskUrl("not a url")).toBe("••••");
  });

  it("never lets a secret through in a channel view", () => {
    const channels = [
      make({
        name: "ntfy",
        type: "ntfy",
        config: { topic: "homelab-alerts-1234", token: "tk_secretsecret99" },
      }),
      make({ name: "ntfy open", type: "ntfy", config: { topic: "open" } }),
      make({
        name: "Gotify",
        type: "gotify",
        config: { server: "https://g.example", token: "AbCdEfGhIjKl" },
      }),
      make({ name: "Discord", type: "discord", config: { webhookUrl: DISCORD_URL } }),
      make({
        name: "Hook",
        type: "webhook",
        config: {
          url: "https://hooks.example/run?token=supersecretvalue",
          headers: [{ name: "Authorization", value: "Bearer hunter2hunter2" }],
        },
      }),
    ];
    const views = JSON.stringify(channels.map(toChannelView));
    for (const secret of [
      "homelab-alerts-1234",
      "tk_secretsecret99",
      "AbCdEfGhIjKl",
      "abcdefghijklmnop",
      "supersecretvalue",
      "hunter2hunter2",
    ]) {
      expect(views).not.toContain(secret);
    }
    expect(channels.map(toChannelView).map((view) => view.config)).toEqual([
      {
        server: "https://ntfy.sh",
        topic: "••••1234",
        token: "••••et99",
        priority: 4,
        tags: [],
      },
      { server: "https://ntfy.sh", topic: "••••", token: null, priority: 4, tags: [] },
      { server: "https://g.example", token: "••••IjKl", priority: 8 },
      { webhookUrl: "https://discord.com/••••WXYZ" },
      {
        url: "https://hooks.example/••••alue",
        headers: [{ name: "Authorization", value: "••••ter2" }],
      },
    ]);
  });
});

describe("applyChannelUpdate", () => {
  it("keeps secrets that are left out or masked and replaces the rest", () => {
    const stored = make({
      name: "Phone",
      type: "ntfy",
      config: { topic: "homelab", token: "tk_one", priority: 3, tags: ["a"] },
    });
    const result = update(stored, {
      name: "Phone 2",
      events: { status: true, alerts: false },
      type: "ntfy",
      config: { server: "https://ntfy.example.com", topic: "••••", priority: 5 },
    });
    expect(result).toEqual({
      ok: true,
      channel: {
        id: "c1",
        name: "Phone 2",
        events: { status: true, alerts: false },
        type: "ntfy",
        config: {
          server: "https://ntfy.example.com",
          topic: "homelab",
          token: "tk_one",
          priority: 5,
          tags: [],
        },
        createdAt: 1_000,
        updatedAt: 2_000,
      },
    });
  });

  it("replaces or removes an ntfy token", () => {
    const stored = make({ name: "P", type: "ntfy", config: { topic: "t", token: "tk_one" } });
    const replaced = update(stored, {
      name: "P",
      type: "ntfy",
      config: { topic: "u", token: "tk_two" },
    });
    expect(replaced.ok && replaced.channel.config).toMatchObject({ topic: "u", token: "tk_two" });
    const removed = update(stored, { name: "P", type: "ntfy", config: { token: "" } });
    expect(removed.ok && removed.channel.config).toMatchObject({ topic: "t", token: null });
  });

  it("merges Gotify and Discord secrets", () => {
    const gotify = make({
      name: "G",
      type: "gotify",
      config: { server: "https://g.example", token: "Aold" },
    });
    const keptToken = update(gotify, {
      name: "G",
      type: "gotify",
      config: { server: "https://g2.example", priority: 2 },
    });
    expect(keptToken.ok && keptToken.channel.config).toEqual({
      server: "https://g2.example",
      token: "Aold",
      priority: 2,
    });
    const newToken = update(gotify, {
      name: "G",
      type: "gotify",
      config: { server: "https://g.example", token: "Anew" },
    });
    expect(newToken.ok && newToken.channel.config).toMatchObject({ token: "Anew" });

    const discord = make({ name: "D", type: "discord", config: { webhookUrl: DISCORD_URL } });
    const kept = update(discord, { name: "D2", type: "discord", config: {} });
    expect(kept.ok && kept.channel).toMatchObject({
      name: "D2",
      config: { webhookUrl: DISCORD_URL },
    });
    const replaced = update(discord, {
      name: "D",
      type: "discord",
      config: { webhookUrl: "https://discord.com/api/webhooks/9/new" },
    });
    expect(replaced.ok && replaced.channel.config).toEqual({
      webhookUrl: "https://discord.com/api/webhooks/9/new",
    });
  });

  it("keeps webhook header values by name and asks for new ones", () => {
    const stored = make({
      name: "W",
      type: "webhook",
      config: {
        url: "https://h.example/x",
        headers: [{ name: "Authorization", value: "Bearer a" }],
      },
    });
    const result = update(stored, {
      name: "W",
      type: "webhook",
      config: { headers: [{ name: "authorization" }, { name: "X-Extra", value: "1" }] },
    });
    expect(result.ok && result.channel.config).toEqual({
      url: "https://h.example/x",
      headers: [
        { name: "authorization", value: "Bearer a" },
        { name: "X-Extra", value: "1" },
      ],
    });

    expect(
      update(stored, { name: "W", type: "webhook", config: { headers: [{ name: "X-New" }] } })
    ).toEqual({ ok: false, error: "header X-New needs a value" });

    const replaced = update(stored, {
      name: "W",
      type: "webhook",
      config: { url: "https://h.example/y", headers: [] },
    });
    expect(replaced.ok && replaced.channel.config).toEqual({
      url: "https://h.example/y",
      headers: [],
    });
  });

  it("refuses to change a channel's type", () => {
    const stored = make({ name: "D", type: "discord", config: { webhookUrl: DISCORD_URL } });
    expect(
      update(stored, { name: "D", type: "webhook", config: { url: "https://h.example" } })
    ).toEqual({ ok: false, error: "a channel's type can't be changed" });
  });
});
