import type {
  DockerSnapshot,
  HostSnapshot,
  MetricAlert,
  MetricSample,
  ServiceStatus,
} from "./types";

/**
 * Topics a client can subscribe to on GET /api/events?topics=... `metrics` carries the small
 * per-tick sample; `host` carries the full HostSnapshot from the same tick, for views that need it;
 * `status` carries a service's status after each check; `containers` the Docker container list
 * whenever it changes.
 */
export const EVENT_TOPICS = [
  "metrics",
  "config",
  "host",
  "alerts",
  "status",
  "containers",
] as const;
export type EventTopic = (typeof EVENT_TOPICS)[number];

/** What a config change touched, so clients refetch only what they need. */
export type ConfigScope = "layout" | "settings" | "all";

export interface MetricsEvent {
  sample: MetricSample;
  type: "metrics";
}

export interface HostEvent {
  snapshot: HostSnapshot;
  type: "host";
}

/** A metric alert started firing (resolvedAt null) or resolved. */
export interface AlertEvent {
  alert: MetricAlert;
  type: "alert";
}

export interface ConfigChangedEvent {
  /** The tab that made the change, so it can ignore its own echo. */
  origin: string | null;
  scope: ConfigScope;
  type: "config.changed";
}

/** A service's status after a check, or null once its check is turned off or it is deleted. */
export interface StatusEvent {
  id: string;
  status: ServiceStatus | null;
  type: "status";
}

/** The Docker container list after something changed (state, health, CPU or memory). */
export interface ContainersEvent {
  snapshot: DockerSnapshot;
  type: "containers";
}

export type ServerEvent =
  AlertEvent | ConfigChangedEvent | ContainersEvent | HostEvent | MetricsEvent | StatusEvent;

export const TOPIC_BY_EVENT_TYPE: Record<ServerEvent["type"], EventTopic> = {
  alert: "alerts",
  "config.changed": "config",
  containers: "containers",
  host: "host",
  metrics: "metrics",
  status: "status",
};

/** Header clients send with mutations so the resulting event names its origin. */
export const ORIGIN_HEADER = "X-Orbitdash-Origin";

/** Parses `?topics=a,b`; unknown names are dropped, and an empty list means every topic. */
export function parseEventTopics(value: string | null | undefined): EventTopic[] {
  const requested = (value ?? "")
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic): topic is EventTopic => (EVENT_TOPICS as readonly string[]).includes(topic));
  return requested.length > 0 ? [...new Set(requested)] : [...EVENT_TOPICS];
}

/**
 * Which config scope a successful mutation affects, or null if it changes nothing other clients
 * show (for example taking a manual backup snapshot).
 */
export function configScopeForMutation(path: string): ConfigScope | null {
  if (path === "/api/backup/import") return "all";
  if (path === "/api/import/apply") return "layout";
  if (path.startsWith("/api/backup")) return null;
  if (path.startsWith("/api/settings/category-order")) return "layout";
  if (path.startsWith("/api/settings") || path.startsWith("/api/alerts")) return "settings";
  if (path.startsWith("/api/widgets/agenda/feeds")) return "settings";
  // Sending a test changes no settings.
  if (path.startsWith("/api/notifications")) return path.endsWith("/test") ? null : "settings";
  if (path.startsWith("/api/services") || path.startsWith("/api/categories")) return "layout";
  return null;
}
