import { BellRing, MessagesSquare, Smartphone, Webhook, type LucideIcon } from "lucide-react";
import type { ChannelPayload } from "@/lib/api/notifications";
import {
  GOTIFY_PRIORITY,
  HEADER_NAME_PATTERN,
  isDiscordWebhookUrl,
  normalizeServerUrl,
  NTFY_DEFAULT_SERVER,
  NTFY_PRIORITY,
  NTFY_TOPIC_PATTERN,
  parseHttpUrl,
  RESERVED_HEADER_NAMES,
} from "@shared/notifications";
import type {
  NotificationChannel,
  NotificationChannelType,
  NotificationDelivery,
} from "@shared/types";

/**
 * The channel form's state and how it maps to and from the API. Secrets start empty when editing:
 * an empty secret is left out of the request, which keeps the stored one, and its mask is shown as
 * the placeholder.
 */

export interface HeaderDraft {
  key: number;
  name: string;
  value: string;
  /** The saved value's mask, when the header was loaded from a saved channel. */
  saved: string | null;
}

export interface ChannelDraft {
  type: NotificationChannelType;
  name: string;
  events: { status: boolean; alerts: boolean };
  server: string;
  topic: string;
  token: string;
  removeToken: boolean;
  priority: number;
  tags: string;
  url: string;
  headers: HeaderDraft[];
  /** Masks of saved secrets, for placeholders; null when nothing is saved. */
  saved: { topic: string | null; token: string | null; url: string | null };
}

export const CHANNEL_ICONS: Record<NotificationChannelType, LucideIcon> = {
  ntfy: BellRing,
  gotify: Smartphone,
  discord: MessagesSquare,
  webhook: Webhook,
};

const PRIORITY_CHOICES = {
  ntfy: [
    { value: 1, label: "Min" },
    { value: 2, label: "Low" },
    { value: 3, label: "Default" },
    { value: 4, label: "High" },
    { value: 5, label: "Urgent" },
  ],
  gotify: [
    { value: 2, label: "Low" },
    { value: 5, label: "Normal" },
    { value: 8, label: "High" },
    { value: 10, label: "Max" },
  ],
};

/** Named priorities, plus the current one when it was set to something in between. */
export function priorityChoices(
  type: "ntfy" | "gotify",
  current: number
): Array<{ value: number; label: string }> {
  const choices = PRIORITY_CHOICES[type];
  return choices.some((choice) => choice.value === current)
    ? choices
    : [...choices, { value: current, label: String(current) }].sort((a, b) => a.value - b.value);
}

const DEFAULT_NAMES: Record<NotificationChannelType, string> = {
  ntfy: "ntfy",
  gotify: "Gotify",
  discord: "Discord",
  webhook: "Webhook",
};

let headerKey = 0;
export const nextHeaderKey = () => (headerKey += 1);

export function emptyDraft(type: NotificationChannelType): ChannelDraft {
  return {
    type,
    name: DEFAULT_NAMES[type],
    events: { status: true, alerts: true },
    server: type === "ntfy" ? NTFY_DEFAULT_SERVER : "",
    topic: "",
    token: "",
    removeToken: false,
    priority: type === "gotify" ? GOTIFY_PRIORITY.default : NTFY_PRIORITY.default,
    tags: "",
    url: "",
    headers: [],
    saved: { topic: null, token: null, url: null },
  };
}

/** A new channel's form keeps a name the user typed, and the events, when the type changes. */
export function switchDraftType(draft: ChannelDraft, type: NotificationChannelType): ChannelDraft {
  const next = emptyDraft(type);
  const typedName = draft.name.trim() !== "" && draft.name !== DEFAULT_NAMES[draft.type];
  return { ...next, name: typedName ? draft.name : next.name, events: draft.events };
}

export function draftFromChannel(channel: NotificationChannel): ChannelDraft {
  const base = { ...emptyDraft(channel.type), name: channel.name, events: { ...channel.events } };
  switch (channel.type) {
    case "ntfy":
      return {
        ...base,
        server: channel.config.server,
        priority: channel.config.priority,
        tags: channel.config.tags.join(", "),
        saved: { topic: channel.config.topic, token: channel.config.token, url: null },
      };
    case "gotify":
      return {
        ...base,
        server: channel.config.server,
        priority: channel.config.priority,
        saved: { topic: null, token: channel.config.token, url: null },
      };
    case "discord":
      return { ...base, saved: { topic: null, token: null, url: channel.config.webhookUrl } };
    case "webhook":
      return {
        ...base,
        headers: channel.config.headers.map((header) => ({
          key: nextHeaderKey(),
          name: header.name,
          value: "",
          saved: header.value,
        })),
        saved: { topic: null, token: null, url: channel.config.url },
      };
  }
}

/** Only fields the user filled in; an empty secret is left out so the saved one stays. */
const filled = (key: string, value: string) => (value.trim() ? { [key]: value.trim() } : {});

export function payloadFromDraft(draft: ChannelDraft): ChannelPayload {
  const base = { name: draft.name.trim(), events: draft.events, type: draft.type };
  switch (draft.type) {
    case "ntfy":
      return {
        ...base,
        config: {
          server: draft.server.trim(),
          ...filled("topic", draft.topic),
          ...(draft.removeToken ? { token: null } : filled("token", draft.token)),
          priority: draft.priority,
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      };
    case "gotify":
      return {
        ...base,
        config: {
          server: draft.server.trim(),
          ...filled("token", draft.token),
          priority: draft.priority,
        },
      };
    case "discord":
      return { ...base, config: filled("webhookUrl", draft.url) };
    case "webhook":
      return {
        ...base,
        config: {
          ...filled("url", draft.url),
          headers: draft.headers
            .filter((header) => header.name.trim() || header.value)
            .map((header) => ({
              name: header.name.trim(),
              ...(header.value ? { value: header.value } : {}),
            })),
        },
      };
  }
}

const needs = (value: string, saved: string | null) => value.trim() === "" && saved === null;

/** Which input a problem belongs to; header problems name the row by its key. */
export type DraftField = "name" | "server" | "topic" | "token" | "url" | `header-${number}`;

export interface DraftProblem {
  field: DraftField;
  message: string;
}

const problem = (field: DraftField, message: string): DraftProblem => ({ field, message });

/**
 * The first problem a quick look can find, or null. The server checks everything again; this only
 * saves a round trip for the obvious ones.
 */
export function validateDraft(draft: ChannelDraft): DraftProblem | null {
  if (!draft.name.trim()) return problem("name", "Give the channel a name.");
  switch (draft.type) {
    case "ntfy":
      if (!normalizeServerUrl(draft.server)) return problem("server", "Enter the server's URL.");
      if (needs(draft.topic, draft.saved.topic)) return problem("topic", "Enter a topic.");
      if (draft.topic.trim() && !NTFY_TOPIC_PATTERN.test(draft.topic.trim())) {
        return problem("topic", "Topics use letters, numbers, - and _ only.");
      }
      return null;
    case "gotify":
      if (!normalizeServerUrl(draft.server)) return problem("server", "Enter the server's URL.");
      if (needs(draft.token, draft.saved.token)) return problem("token", "Enter the app token.");
      return null;
    case "discord":
      if (needs(draft.url, draft.saved.url)) {
        return problem("url", "Paste the webhook URL from Discord.");
      }
      if (draft.url.trim() && !isDiscordWebhookUrl(draft.url)) {
        return problem("url", "That isn't a Discord webhook URL.");
      }
      return null;
    case "webhook": {
      if (needs(draft.url, draft.saved.url)) return problem("url", "Enter the URL to post to.");
      if (draft.url.trim() && !parseHttpUrl(draft.url)) {
        return problem("url", "Enter an http or https URL.");
      }
      for (const header of draft.headers) {
        const name = header.name.trim();
        if (!name && !header.value) continue;
        if (!HEADER_NAME_PATTERN.test(name) || RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
          return problem(
            `header-${header.key}`,
            name ? `${name} can't be used as a header name.` : "Name the header."
          );
        }
        if (!header.value && header.saved === null) {
          return problem(`header-${header.key}`, `Enter a value for ${name}.`);
        }
      }
      return null;
    }
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

/** Where a channel's messages go: a host, never a secret (the API masks those anyway). */
export function channelTarget(channel: NotificationChannel): string {
  switch (channel.type) {
    case "ntfy":
    case "gotify":
      return hostOf(channel.config.server);
    case "discord":
      return hostOf(channel.config.webhookUrl);
    case "webhook":
      return hostOf(channel.config.url);
  }
}

export function describeEvents(events: NotificationChannel["events"]): string {
  if (events.status && events.alerts) return "Status and alerts";
  if (events.status) return "Status only";
  if (events.alerts) return "Alerts only";
  return "Paused";
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayAndClock = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A clock time today, a date and time before. */
export function formatDeliveryTime(ts: number, now: number = Date.now()): string {
  return new Date(ts).toDateString() === new Date(now).toDateString()
    ? clock.format(ts)
    : dayAndClock.format(ts);
}

export function describeDeliveryFailure(delivery: NotificationDelivery): string {
  const reason = delivery.error ?? "Not delivered";
  return delivery.attempts > 1 ? `${reason} after ${delivery.attempts} tries` : reason;
}

/** Server messages start lowercase ("ntfy topic may use..."); a sentence reads better in a form. */
export function asSentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** "America/Los_Angeles" reads as "Los Angeles" in the narrow picker. */
export function shortZoneName(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replace(/_/g, " ");
}

/** Every IANA zone the browser knows, or just the given ones where it can't list them. */
export function listTimeZones(extra: Array<string | null>): string[] {
  const known =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...extra.filter((zone): zone is string => Boolean(zone)), ...known])].sort();
}
