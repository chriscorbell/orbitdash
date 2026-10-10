import { alertMetricLabel, describeAlert, formatAlertValue } from "@shared/alerts";
import { formatDowntime } from "@shared/notifications";
import type { MetricAlert, NotificationEvent } from "@shared/types";

/**
 * What a notification says, built once per event and turned into each channel's format by
 * channels.ts. Times are written in the notification time zone.
 */

export type Severity = "critical" | "warning" | "resolved" | "info";
/** Which per-channel toggle lets an event through. */
export type EventKind = "status" | "alerts";

export interface ServiceSubject {
  id: string;
  name: string;
  url: string;
  externalUrl: string | null; // the link for outside your network, when the service has one
}

/** A notification is often read away from home, so a click opens the outside link if there is one. */
const clickUrl = (service: ServiceSubject) => service.externalUrl ?? service.url;

/** Something that happened during quiet hours, for the summary sent when they end. */
export type SummaryItem =
  | {
      kind: "status";
      service: ServiceSubject;
      startedAt: number;
      endedAt: number | null; // null: still down
      error: string | null;
    }
  | { kind: "alerts"; alert: MetricAlert };

export interface NotificationMessage {
  event: NotificationEvent;
  kind: EventKind | null; // null for tests and summaries
  severity: Severity;
  title: string;
  body: string;
  timestamp: number;
  url: string | null; // where a click on the notification goes
  service:
    (ServiceSubject & { error: string | null; downSince: number; upAt: number | null }) | null;
  alert: MetricAlert | null;
  items: NotificationMessage[]; // a summary's entries
}

export interface MessageContext {
  now: number;
  timeZone: string | null;
}

const MAX_SUMMARY_LINES = 20;

function dayKey(ts: number, timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ts);
}

/** "14:02" today, "Oct 9 14:02" before that. */
export function formatTime(ts: number, { now, timeZone }: MessageContext): string {
  const zone = timeZone ?? undefined;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
  if (dayKey(ts, timeZone) === dayKey(now, timeZone)) return clock;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
  }).format(ts);
  return `${date} ${clock}`;
}

const sentence = (...parts: Array<string | null>) =>
  parts.filter((part): part is string => Boolean(part)).join(". ") + ".";

function base(
  event: NotificationEvent,
  kind: EventKind | null,
  severity: Severity,
  title: string,
  body: string,
  ctx: MessageContext
): NotificationMessage {
  return {
    event,
    kind,
    severity,
    title,
    body,
    timestamp: ctx.now,
    url: null,
    service: null,
    alert: null,
    items: [],
  };
}

export function serviceDownMessage(
  service: ServiceSubject,
  downSince: number,
  error: string | null,
  ctx: MessageContext
): NotificationMessage {
  return {
    ...base(
      "service.down",
      "status",
      "critical",
      `${service.name} is down`,
      sentence(error, `Down since ${formatTime(downSince, ctx)}`),
      ctx
    ),
    url: clickUrl(service),
    service: { ...service, error, downSince, upAt: null },
  };
}

export function serviceRecoveredMessage(
  service: ServiceSubject,
  downSince: number,
  upAt: number,
  ctx: MessageContext
): NotificationMessage {
  return {
    ...base(
      "service.recovered",
      "status",
      "resolved",
      `${service.name} is back up`,
      sentence(
        `Down for ${formatDowntime(upAt - downSince)}, from ${formatTime(downSince, ctx)} to ${formatTime(upAt, ctx)}`
      ),
      ctx
    ),
    url: clickUrl(service),
    service: { ...service, error: null, downSince, upAt },
  };
}

function alertLabel(alert: MetricAlert): string {
  const label = alertMetricLabel(alert.metric);
  return alert.subject ? `${label} (${alert.subject})` : label;
}

export function alertFiringMessage(alert: MetricAlert, ctx: MessageContext): NotificationMessage {
  return {
    ...base(
      "alert.firing",
      "alerts",
      "warning",
      describeAlert(alert),
      sentence(
        `Now ${formatAlertValue(alert.metric, alert.value)}, peak ${formatAlertValue(alert.metric, alert.peak)}`,
        `Since ${formatTime(alert.startedAt, ctx)}`
      ),
      ctx
    ),
    alert,
  };
}

export function alertResolvedMessage(alert: MetricAlert, ctx: MessageContext): NotificationMessage {
  const resolvedAt = alert.resolvedAt ?? ctx.now;
  // An alert also resolves when its rule changes or its filesystem goes away, with the value
  // still high; it is "cleared" then, not "back below".
  const below = alert.value <= alert.threshold;
  return {
    ...base(
      "alert.resolved",
      "alerts",
      "resolved",
      below
        ? `${alertLabel(alert)} back below ${formatAlertValue(alert.metric, alert.threshold)}`
        : `${alertLabel(alert)} alert cleared`,
      sentence(
        `Peak ${formatAlertValue(alert.metric, alert.peak)}`,
        `Lasted ${formatDowntime(resolvedAt - alert.startedAt)}, from ${formatTime(alert.startedAt, ctx)} to ${formatTime(resolvedAt, ctx)}`
      ),
      ctx
    ),
    alert,
  };
}

export function testMessage(source: string, ctx: MessageContext): NotificationMessage {
  return base("test", null, "info", "Test notification", `${source} can reach you here.`, ctx);
}

/** One summary entry, worded for a list. */
function summaryEntry(item: SummaryItem, ctx: MessageContext): NotificationMessage {
  if (item.kind === "status") {
    const { service, startedAt, endedAt, error } = item;
    if (endedAt === null) {
      const message = serviceDownMessage(service, startedAt, error, ctx);
      return {
        ...message,
        body: sentence(`${service.name} is still down, since ${formatTime(startedAt, ctx)}`, error),
      };
    }
    const message = serviceRecoveredMessage(service, startedAt, endedAt, ctx);
    return {
      ...message,
      body: sentence(
        `${service.name} was down ${formatTime(startedAt, ctx)} to ${formatTime(endedAt, ctx)} (${formatDowntime(endedAt - startedAt)})`
      ),
    };
  }

  const { alert } = item;
  const peak = formatAlertValue(alert.metric, alert.peak);
  if (alert.resolvedAt === null) {
    return {
      ...alertFiringMessage(alert, ctx),
      body: sentence(
        `${describeAlert(alert)}: still firing, since ${formatTime(alert.startedAt, ctx)} (peak ${peak})`
      ),
    };
  }
  return {
    ...alertResolvedMessage(alert, ctx),
    body: sentence(
      `${describeAlert(alert)}: ${formatTime(alert.startedAt, ctx)} to ${formatTime(alert.resolvedAt, ctx)} (peak ${peak})`
    ),
  };
}

/**
 * What happened during quiet hours, in one message: problems still going on first, then what
 * already passed. Severity follows the worst thing still going on.
 */
export function summaryMessage(items: SummaryItem[], ctx: MessageContext): NotificationMessage {
  const entries = items
    .map((item) => summaryEntry(item, ctx))
    .sort(
      (left, right) => Number(left.severity === "resolved") - Number(right.severity === "resolved")
    );
  const lines = entries.slice(0, MAX_SUMMARY_LINES).map((entry) => entry.body);
  if (entries.length > MAX_SUMMARY_LINES) {
    lines.push(`And ${entries.length - MAX_SUMMARY_LINES} more.`);
  }
  const severity: Severity = entries.some((entry) => entry.severity === "critical")
    ? "critical"
    : entries.some((entry) => entry.severity === "warning")
      ? "warning"
      : "resolved";
  return {
    ...base(
      "summary",
      null,
      severity,
      entries.length === 1 ? "During quiet hours" : `During quiet hours: ${entries.length} updates`,
      lines.join("\n"),
      ctx
    ),
    items: entries,
  };
}
