import type {
  NotificationChannelType,
  NotificationEventToggles,
  NotificationOptions,
  QuietHours,
} from "./types";

/**
 * Notification rules shared by the server (which sends) and the browser (which edits channels).
 * Kept free of zod so the settings section stays light.
 */

export const NOTIFICATION_CHANNEL_TYPES = [
  "ntfy",
  "gotify",
  "discord",
  "webhook",
] as const satisfies readonly NotificationChannelType[];

export const CHANNEL_TYPE_LABELS: Record<NotificationChannelType, string> = {
  ntfy: "ntfy",
  gotify: "Gotify",
  discord: "Discord",
  webhook: "Webhook",
};

export const MAX_NOTIFICATION_CHANNELS = 20;
export const MAX_WEBHOOK_HEADERS = 10;
export const MAX_NTFY_TAGS = 5;
/** Deliveries kept for the log in settings. */
export const DELIVERY_LOG_LIMIT = 50;

export const NTFY_DEFAULT_SERVER = "https://ntfy.sh";
export const NTFY_PRIORITY = { min: 1, max: 5, normal: 3, default: 4 } as const;
export const GOTIFY_PRIORITY = { min: 0, max: 10, normal: 5, default: 8 } as const;

/** Choices for how long a service stays down before a notification goes out. */
export const DOWN_DELAY_MINUTES = [0, 1, 2, 5, 10, 15, 30, 60] as const;

export const DEFAULT_EVENT_TOGGLES: NotificationEventToggles = { status: true, alerts: true };

export const DEFAULT_NOTIFICATION_OPTIONS: NotificationOptions = {
  downDelayMinutes: 2,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  timeZone: null,
};

/**
 * What the API shows in place of a secret; the last four characters follow when it is long. URLs
 * keep their origin in front ("https://discord.com/••••a1b2"), so a mask is found anywhere.
 */
export const SECRET_MASK = "••••";

export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.includes(SECRET_MASK);
}

/** Config fields that hold secrets, per channel type. Webhook header values are secret too. */
export const SECRET_FIELDS: Record<NotificationChannelType, readonly string[]> = {
  ntfy: ["topic", "token"],
  gotify: ["token"],
  discord: ["webhookUrl"],
  webhook: ["url"],
};

export const NTFY_TOPIC_PATTERN = /^[-_A-Za-z0-9]{1,64}$/;
export const NTFY_TAG_PATTERN = /^[^,\s][^,]{0,31}$/;
/** RFC 9110 token characters. */
export const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;
export const HEADER_VALUE_PATTERN = /^[^\r\n\0]{0,1024}$/;
/** Headers fetch sets itself, or that would break the request. */
export const RESERVED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
]);
const DISCORD_WEBHOOK_PATH = /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+\/?$/;

/** An http(s) URL without a user name or password in it, or null. */
export function parseHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url;
}

/** A server's base URL without query, fragment or trailing slash: "https://ntfy.example.com/sub". */
export function normalizeServerUrl(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function isDiscordWebhookUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  return url !== null && url.protocol === "https:" && DISCORD_WEBHOOK_PATH.test(url.pathname);
}

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight for "HH:MM", or null. */
export function parseClock(value: string): number | null {
  const match = CLOCK_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isValidTimeZone(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Minutes after midnight at `ts` in a time zone (null: this machine's). */
export function minutesInZone(ts: number, timeZone: string | null): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(ts);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (Number(values.hour) % 24) * 60 + Number(values.minute);
}

/** Whether a minute of the day falls in the window; a window can cross midnight. */
export function isInQuietWindow(minute: number, quietHours: QuietHours): boolean {
  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  if (!quietHours.enabled || start === null || end === null || start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function isQuietAt(ts: number, options: NotificationOptions): boolean {
  return (
    options.quietHours.enabled &&
    isInQuietWindow(minutesInZone(ts, options.timeZone), options.quietHours)
  );
}

/** "less than a minute", "12 min", "3 h 5 min", "2 d 4 h". */
export function formatDowntime(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}

/** How a delay choice reads: "Right away", "After 5 min", "After 1 hour". */
export function describeDownDelay(minutes: number): string {
  if (minutes === 0) return "Right away";
  return minutes === 60 ? "After 1 hour" : `After ${minutes} min`;
}
