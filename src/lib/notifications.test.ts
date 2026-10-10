import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asSentence,
  channelTarget,
  describeDeliveryFailure,
  describeEvents,
  draftFromChannel,
  emptyDraft,
  formatDeliveryTime,
  listTimeZones,
  payloadFromDraft,
  priorityChoices,
  shortZoneName,
  switchDraftType,
  validateDraft,
  type ChannelDraft,
} from "@/lib/notifications";
import type { NotificationChannel, NotificationDelivery } from "@shared/types";

const base = {
  id: "c1",
  name: "Phone",
  events: { status: true, alerts: false },
  createdAt: 1,
  updatedAt: 1,
};

const channels: Record<NotificationChannel["type"], NotificationChannel> = {
  ntfy: {
    ...base,
    type: "ntfy",
    config: {
      server: "https://ntfy.sh",
      topic: "••••erts",
      token: "••••1234",
      priority: 5,
      tags: ["a", "b"],
    },
  },
  gotify: {
    ...base,
    type: "gotify",
    config: { server: "https://push.example.com/gotify", token: "••••", priority: 8 },
  },
  discord: { ...base, type: "discord", config: { webhookUrl: "https://discord.com/••••WXYZ" } },
  webhook: {
    ...base,
    type: "webhook",
    config: {
      url: "https://hooks.example.com:8443/••••abcd",
      headers: [{ name: "Authorization", value: "••••" }],
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("channel drafts", () => {
  it("start with each type's defaults", () => {
    expect(emptyDraft("ntfy")).toMatchObject({
      name: "ntfy",
      server: "https://ntfy.sh",
      priority: 4,
      events: { status: true, alerts: true },
    });
    expect(emptyDraft("gotify")).toMatchObject({ name: "Gotify", server: "", priority: 8 });
  });

  it("keep a typed name and the events when the type changes", () => {
    const typed = { ...emptyDraft("ntfy"), name: "Phone", events: { status: false, alerts: true } };
    expect(switchDraftType(typed, "discord")).toMatchObject({
      type: "discord",
      name: "Phone",
      events: { status: false, alerts: true },
      server: "",
    });
    expect(switchDraftType(emptyDraft("ntfy"), "webhook").name).toBe("Webhook");
    expect(switchDraftType({ ...emptyDraft("ntfy"), name: " " }, "gotify").name).toBe("Gotify");
  });

  it("load saved channels with empty secrets and their masks as placeholders", () => {
    expect(draftFromChannel(channels.ntfy)).toMatchObject({
      name: "Phone",
      server: "https://ntfy.sh",
      topic: "",
      token: "",
      priority: 5,
      tags: "a, b",
      saved: { topic: "••••erts", token: "••••1234", url: null },
    });
    expect(draftFromChannel(channels.gotify)).toMatchObject({
      server: "https://push.example.com/gotify",
      saved: { token: "••••" },
    });
    expect(draftFromChannel(channels.discord).saved.url).toBe("https://discord.com/••••WXYZ");
    const webhook = draftFromChannel(channels.webhook);
    expect(webhook.headers).toEqual([
      { key: expect.any(Number), name: "Authorization", value: "", saved: "••••" },
    ]);
  });
});

describe("payloadFromDraft", () => {
  it("sends every field of a new channel", () => {
    const draft: ChannelDraft = {
      ...emptyDraft("ntfy"),
      name: " Phone ",
      topic: " alerts ",
      token: "tk_1",
      tags: "a, , b",
    };
    expect(payloadFromDraft(draft)).toEqual({
      name: "Phone",
      events: { status: true, alerts: true },
      type: "ntfy",
      config: {
        server: "https://ntfy.sh",
        topic: "alerts",
        token: "tk_1",
        priority: 4,
        tags: ["a", "b"],
      },
    });
  });

  it("leaves untouched secrets out, and removes a token when asked", () => {
    const ntfy = draftFromChannel(channels.ntfy);
    expect(payloadFromDraft(ntfy).config).toEqual({
      server: "https://ntfy.sh",
      priority: 5,
      tags: ["a", "b"],
    });
    expect(payloadFromDraft({ ...ntfy, removeToken: true }).config).toMatchObject({ token: null });
    expect(payloadFromDraft(draftFromChannel(channels.gotify)).config).toEqual({
      server: "https://push.example.com/gotify",
      priority: 8,
    });
    expect(payloadFromDraft(draftFromChannel(channels.discord)).config).toEqual({});
    expect(
      payloadFromDraft({ ...draftFromChannel(channels.discord), url: " https://d/x " }).config
    ).toEqual({ webhookUrl: "https://d/x" });
  });

  it("sends webhook headers, keeping saved values by leaving them out", () => {
    const draft = draftFromChannel(channels.webhook);
    draft.headers.push(
      { key: 98, name: " X-Extra ", value: "1", saved: null },
      { key: 99, name: "", value: "", saved: null }
    );
    expect(payloadFromDraft(draft).config).toEqual({
      headers: [{ name: "Authorization" }, { name: "X-Extra", value: "1" }],
    });
  });
});

describe("validateDraft", () => {
  const check = (draft: Partial<ChannelDraft> & { type: ChannelDraft["type"] }) =>
    validateDraft({ ...emptyDraft(draft.type), ...draft });

  it("asks for what each type needs", () => {
    expect(check({ type: "ntfy", name: "" })).toEqual({
      field: "name",
      message: "Give the channel a name.",
    });
    expect(check({ type: "ntfy", server: "ftp://x" })?.field).toBe("server");
    expect(check({ type: "ntfy" })).toEqual({ field: "topic", message: "Enter a topic." });
    expect(check({ type: "ntfy", topic: "bad topic" })?.message).toBe(
      "Topics use letters, numbers, - and _ only."
    );
    expect(check({ type: "ntfy", topic: "good" })).toBeNull();
    expect(check({ type: "gotify" })?.field).toBe("server");
    expect(check({ type: "gotify", server: "https://g" })?.field).toBe("token");
    expect(check({ type: "gotify", server: "https://g", token: "A" })).toBeNull();
    expect(check({ type: "discord" })?.field).toBe("url");
    expect(check({ type: "discord", url: "https://example.com/x" })?.message).toBe(
      "That isn't a Discord webhook URL."
    );
    expect(check({ type: "discord", url: "https://discord.com/api/webhooks/1/a" })).toBeNull();
    expect(check({ type: "webhook" })?.message).toBe("Enter the URL to post to.");
    expect(check({ type: "webhook", url: "nope" })?.message).toBe("Enter an http or https URL.");
  });

  it("checks webhook headers row by row", () => {
    const url = "https://hooks.example.com";
    const row = (name: string, value: string, saved: string | null = null) => ({
      key: 7,
      name,
      value,
      saved,
    });
    expect(check({ type: "webhook", url, headers: [row("", "")] })).toBeNull();
    expect(check({ type: "webhook", url, headers: [row("", "x")] })).toEqual({
      field: "header-7",
      message: "Name the header.",
    });
    expect(check({ type: "webhook", url, headers: [row("Host", "x")] })?.message).toBe(
      "Host can't be used as a header name."
    );
    expect(check({ type: "webhook", url, headers: [row("X-A", "")] })?.message).toBe(
      "Enter a value for X-A."
    );
    expect(check({ type: "webhook", url, headers: [row("X-A", "", "••••")] })).toBeNull();
    // Saved secrets don't need to be typed again.
    expect(validateDraft(draftFromChannel(channels.webhook))).toBeNull();
  });
});

describe("channel and delivery wording", () => {
  it("names where a channel sends, never a secret", () => {
    expect(channelTarget(channels.ntfy)).toBe("ntfy.sh");
    expect(channelTarget(channels.gotify)).toBe("push.example.com");
    expect(channelTarget(channels.discord)).toBe("discord.com");
    expect(channelTarget(channels.webhook)).toBe("hooks.example.com:8443");
    expect(
      channelTarget({ ...channels.discord, config: { webhookUrl: "••••" } } as NotificationChannel)
    ).toBe("••••");
  });

  it("describes the events a channel gets", () => {
    expect(describeEvents({ status: true, alerts: true })).toBe("Status and alerts");
    expect(describeEvents({ status: true, alerts: false })).toBe("Status only");
    expect(describeEvents({ status: false, alerts: true })).toBe("Alerts only");
    expect(describeEvents({ status: false, alerts: false })).toBe("Paused");
  });

  it("formats delivery times and failures", () => {
    const now = new Date(2026, 9, 10, 14, 30).getTime();
    expect(formatDeliveryTime(new Date(2026, 9, 10, 9, 5).getTime(), now)).not.toMatch(/Oct/);
    expect(formatDeliveryTime(new Date(2026, 9, 8, 9, 5).getTime(), now)).toMatch(/Oct/);
    expect(typeof formatDeliveryTime(now)).toBe("string");

    const delivery = { error: "HTTP 502", attempts: 3 } as NotificationDelivery;
    expect(describeDeliveryFailure(delivery)).toBe("HTTP 502 after 3 tries");
    expect(describeDeliveryFailure({ ...delivery, attempts: 1 })).toBe("HTTP 502");
    expect(describeDeliveryFailure({ ...delivery, error: null, attempts: 1 })).toBe(
      "Not delivered"
    );
  });

  it("turns server errors into sentences", () => {
    expect(asSentence("ntfy topic is wrong")).toBe("Ntfy topic is wrong.");
    expect(asSentence("Already done.")).toBe("Already done.");
  });

  it("offers named priorities and keeps an odd one", () => {
    expect(priorityChoices("ntfy", 3).map((choice) => choice.label)).toEqual([
      "Min",
      "Low",
      "Default",
      "High",
      "Urgent",
    ]);
    expect(priorityChoices("gotify", 6).map((choice) => choice.value)).toEqual([2, 5, 6, 8, 10]);
  });

  it("lists time zones with the ones in use first in sort order", () => {
    expect(shortZoneName("America/Los_Angeles")).toBe("Los Angeles");
    expect(shortZoneName("UTC")).toBe("UTC");
    const zones = listTimeZones(["Etc/UTC", null]);
    expect(zones).toContain("Etc/UTC");
    expect(zones).toContain("Europe/Berlin");
    expect([...zones].sort()).toEqual(zones);

    vi.stubGlobal("Intl", { ...Intl, supportedValuesOf: undefined });
    expect(listTimeZones(["Mars/Base", "Etc/UTC"])).toEqual(["Etc/UTC", "Mars/Base"]);
  });
});
