import { GOTIFY_PRIORITY, NTFY_PRIORITY } from "@shared/notifications";
import type { MetricAlert, NotificationChannel } from "@shared/types";
import type { NotificationMessage, Severity } from "./messages";

/** Each channel type's request for a message. Pure, so tests compare requests, not the network. */

export interface ChannelRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const USER_AGENT = "orbitdash";
const JSON_HEADERS = { "Content-Type": "application/json", "User-Agent": USER_AGENT };

const DISCORD_COLORS: Record<Severity, number> = {
  critical: 0xef4444,
  warning: 0xf59e0b,
  resolved: 0x22c55e,
  info: 0x3b82f6,
};

/** ntfy shows these tags as emoji in front of the title. */
const NTFY_SEVERITY_TAGS: Record<Severity, string> = {
  critical: "rotating_light",
  warning: "warning",
  resolved: "white_check_mark",
  info: "bell",
};

const isProblem = (severity: Severity) => severity === "critical" || severity === "warning";

/** Problems use the channel's priority; everything else never rises above the normal one. */
function priorityFor(severity: Severity, configured: number, normal: number): number {
  return isProblem(severity) ? configured : Math.min(configured, normal);
}

const iso = (ts: number | null) => (ts === null ? null : new Date(ts).toISOString());

function alertPayload(alert: MetricAlert) {
  return {
    id: alert.id,
    metric: alert.metric,
    subject: alert.subject,
    threshold: alert.threshold,
    durationSeconds: alert.durationSec,
    value: alert.value,
    peak: alert.peak,
    startedAt: iso(alert.startedAt),
    firedAt: iso(alert.firedAt),
    resolvedAt: iso(alert.resolvedAt),
  };
}

function eventPayload(message: NotificationMessage) {
  const { service } = message;
  return {
    event: message.event,
    severity: message.severity,
    title: message.title,
    message: message.body,
    service: service
      ? {
          id: service.id,
          name: service.name,
          url: service.url,
          error: service.error,
          downSince: iso(service.downSince),
          recoveredAt: iso(service.upAt),
          downtimeSeconds:
            service.upAt === null ? null : Math.round((service.upAt - service.downSince) / 1000),
        }
      : null,
    alert: message.alert ? alertPayload(message.alert) : null,
  };
}

/** The generic webhook's body, documented in the README. Bump `version` on breaking changes. */
export function webhookPayload(message: NotificationMessage, source: string) {
  return {
    version: 1,
    source,
    timestamp: iso(message.timestamp),
    ...eventPayload(message),
    items: message.items.map(eventPayload),
  };
}

export function buildChannelRequest(
  channel: NotificationChannel,
  message: NotificationMessage,
  source: string
): ChannelRequest {
  switch (channel.type) {
    case "ntfy": {
      const { server, topic, token, priority, tags } = channel.config;
      // JSON publishing goes to the server root and keeps non-ASCII titles intact.
      return {
        url: `${server}/`,
        headers: token ? { ...JSON_HEADERS, Authorization: `Bearer ${token}` } : JSON_HEADERS,
        body: JSON.stringify({
          topic,
          title: message.title,
          message: message.body,
          priority: priorityFor(message.severity, priority, NTFY_PRIORITY.normal),
          tags: [NTFY_SEVERITY_TAGS[message.severity], ...tags],
          ...(message.url ? { click: message.url } : {}),
        }),
      };
    }
    case "gotify": {
      const { server, token, priority } = channel.config;
      return {
        url: `${server}/message`,
        headers: { ...JSON_HEADERS, "X-Gotify-Key": token },
        body: JSON.stringify({
          title: message.title,
          message: message.body,
          priority: priorityFor(message.severity, priority, GOTIFY_PRIORITY.normal),
          extras: {
            "client::display": { contentType: "text/plain" },
            ...(message.url ? { "client::notification": { click: { url: message.url } } } : {}),
          },
        }),
      };
    }
    case "discord":
      return {
        url: channel.config.webhookUrl,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          // Service names come from the dashboard; never let one ping @everyone.
          allowed_mentions: { parse: [] },
          embeds: [
            {
              title: message.title.slice(0, 256),
              description: message.body.slice(0, 4096),
              color: DISCORD_COLORS[message.severity],
              timestamp: iso(message.timestamp),
              footer: { text: source.slice(0, 2048) },
              ...(message.url ? { url: message.url } : {}),
            },
          ],
        }),
      };
    case "webhook":
      return {
        url: channel.config.url,
        headers: {
          ...JSON_HEADERS,
          ...Object.fromEntries(
            channel.config.headers.map((header) => [header.name, header.value])
          ),
        },
        body: JSON.stringify(webhookPayload(message, source)),
      };
  }
}
