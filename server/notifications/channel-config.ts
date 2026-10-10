import { SECRET_MASK } from "@shared/notifications";
import type {
  NotificationChannelCreate,
  NotificationChannelUpdate,
} from "@shared/notification-schemas";
import type { NotificationChannel, WebhookHeader } from "@shared/types";

/**
 * Channels as stored (with secrets) and as the API shows them (with masks), and how an update that
 * leaves secrets out is merged into the stored channel.
 */

const SHOWN_SUFFIX_MIN_LENGTH = 12;

/** "••••a1b2" for a long secret, plain "••••" for a short one, so a mask never gives half away. */
export function maskSecret(value: string): string {
  return value.length >= SHOWN_SUFFIX_MIN_LENGTH ? `${SECRET_MASK}${value.slice(-4)}` : SECRET_MASK;
}

/** Keeps the origin, which says where messages go, and masks the path and query. */
export function maskUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return SECRET_MASK;
  }
  const rest = `${url.pathname}${url.search}`;
  const suffix = rest.length >= SHOWN_SUFFIX_MIN_LENGTH ? rest.slice(-4) : "";
  return `${url.origin}/${SECRET_MASK}${suffix}`;
}

/** The channel with every secret masked: what the API returns, to editors and guests alike. */
export function toChannelView(channel: NotificationChannel): NotificationChannel {
  switch (channel.type) {
    case "ntfy":
      return {
        ...channel,
        config: {
          ...channel.config,
          topic: maskSecret(channel.config.topic),
          token: channel.config.token === null ? null : maskSecret(channel.config.token),
          tags: [...channel.config.tags],
        },
      };
    case "gotify":
      return { ...channel, config: { ...channel.config, token: maskSecret(channel.config.token) } };
    case "discord":
      return { ...channel, config: { webhookUrl: maskUrl(channel.config.webhookUrl) } };
    case "webhook":
      return {
        ...channel,
        config: {
          url: maskUrl(channel.config.url),
          headers: channel.config.headers.map((header) => ({
            name: header.name,
            value: maskSecret(header.value),
          })),
        },
      };
  }
}

export function createChannel(
  input: NotificationChannelCreate,
  id: string,
  now: number
): NotificationChannel {
  return {
    ...(input as Omit<NotificationChannel, "id" | "createdAt" | "updatedAt">),
    id,
    createdAt: now,
    updatedAt: now,
  } as NotificationChannel;
}

export type ChannelUpdateResult =
  { ok: true; channel: NotificationChannel } | { ok: false; error: string };

function mergeHeaders(
  stored: WebhookHeader[],
  next: Array<{ name: string; value?: string }>
): WebhookHeader[] | string {
  const merged: WebhookHeader[] = [];
  for (const header of next) {
    const value =
      header.value ??
      stored.find((entry) => entry.name.toLowerCase() === header.name.toLowerCase())?.value;
    if (value === undefined) return `header ${header.name} needs a value`;
    merged.push({ name: header.name, value });
  }
  return merged;
}

/**
 * Applies an update to a stored channel. Secrets the update leaves out (or sends back masked) keep
 * their stored values; everything else is replaced. A channel's type can't change.
 */
export function applyChannelUpdate(
  stored: NotificationChannel,
  update: NotificationChannelUpdate,
  now: number
): ChannelUpdateResult {
  if (update.type !== stored.type) {
    return { ok: false, error: "a channel's type can't be changed" };
  }
  const base = {
    id: stored.id,
    name: update.name,
    events: update.events,
    createdAt: stored.createdAt,
    updatedAt: now,
  };

  if (update.type === "ntfy" && stored.type === "ntfy") {
    const { topic, token, ...rest } = update.config;
    return {
      ok: true,
      channel: {
        ...base,
        type: "ntfy",
        config: {
          ...rest,
          topic: topic ?? stored.config.topic,
          // Left out keeps the token; null or an empty string removes it.
          token: token === undefined ? stored.config.token : token || null,
        },
      },
    };
  }
  if (update.type === "gotify" && stored.type === "gotify") {
    return {
      ok: true,
      channel: {
        ...base,
        type: "gotify",
        config: { ...update.config, token: update.config.token ?? stored.config.token },
      },
    };
  }
  if (update.type === "discord" && stored.type === "discord") {
    return {
      ok: true,
      channel: {
        ...base,
        type: "discord",
        config: { webhookUrl: update.config.webhookUrl ?? stored.config.webhookUrl },
      },
    };
  }

  const storedWebhook = stored as Extract<NotificationChannel, { type: "webhook" }>;
  const webhook = update as Extract<NotificationChannelUpdate, { type: "webhook" }>;
  const headers = mergeHeaders(storedWebhook.config.headers, webhook.config.headers);
  if (typeof headers === "string") return { ok: false, error: headers };
  return {
    ok: true,
    channel: {
      ...base,
      type: "webhook",
      config: { url: webhook.config.url ?? storedWebhook.config.url, headers },
    },
  };
}
