import type { MetricAlert, NotificationChannel, ServiceStatus } from "@shared/types";

/** Shared fixtures for the notification tests. */

export const DISCORD_URL = "https://discord.com/api/webhooks/123/abcdefghijklmnopWXYZ";

const channelBase = {
  events: { status: true, alerts: true },
  createdAt: 1,
  updatedAt: 1,
};

export const ntfyChannel: NotificationChannel = {
  ...channelBase,
  id: "ntfy",
  name: "Phone",
  type: "ntfy",
  config: {
    server: "https://ntfy.example.com",
    topic: "homelab",
    token: "tk_secret",
    priority: 4,
    tags: ["house"],
  },
};

export const gotifyChannel: NotificationChannel = {
  ...channelBase,
  id: "gotify",
  name: "Gotify",
  type: "gotify",
  config: { server: "https://push.example.com/gotify", token: "Agotify", priority: 8 },
};

export const discordChannel: NotificationChannel = {
  ...channelBase,
  id: "discord",
  name: "Discord",
  type: "discord",
  config: { webhookUrl: DISCORD_URL },
};

export const webhookChannel: NotificationChannel = {
  ...channelBase,
  id: "webhook",
  name: "Hook",
  type: "webhook",
  config: {
    url: "https://hooks.example.com/notify?token=abc",
    headers: [{ name: "Authorization", value: "Bearer xyz" }],
  },
};

export function status(
  state: ServiceStatus["state"],
  changedAt: number | null,
  error: string | null = state === "down" ? "Connection refused" : null
): ServiceStatus {
  return {
    id: "svc",
    state,
    latencyMs: state === "down" ? null : 40,
    statusCode: null,
    error,
    checkedAt: changedAt,
    changedAt,
  };
}

export function alert(overrides: Partial<MetricAlert> = {}): MetricAlert {
  return {
    id: "a1",
    metric: "cpu",
    subject: null,
    threshold: 90,
    durationSec: 300,
    value: 97,
    peak: 98,
    startedAt: 0,
    firedAt: 300_000,
    resolvedAt: null,
    ...overrides,
  };
}
