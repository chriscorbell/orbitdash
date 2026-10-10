/** A single metrics sample */
export interface MetricSample {
  ts: number; // ms since epoch
  cpu: number; // percentage 0-100
  ram: number; // percentage 0-100
  disk: number; // percentage 0-100
}

/**
 * Full host reading taken on the same tick as a MetricSample (GET /api/metrics/host and the `host`
 * event topic). Rates are averages over `intervalMs`; a rate is null when there is no previous
 * reading to compare against yet, or when a counter went backwards (reset, hotplug). Anything the
 * server can't read on this platform is null or an empty list.
 */
export interface HostSnapshot {
  version: 1;
  ts: number; // ms since epoch
  intervalMs: number | null; // time since the previous snapshot, null for the first
  cpu: HostCpu;
  memory: HostMemory | null;
  temperatures: HostTemperature[];
  filesystems: HostFilesystem[];
  disks: HostDiskIo[];
  network: HostNetworkInterface[];
}

export interface HostCpu {
  usage: number | null; // percentage 0-100 across every core
  cores: HostCpuCore[];
  load: HostLoadAverage | null;
  frequencyMhz: number | null; // average current frequency across cores
  temperatureCelsius: number | null; // the CPU package (or closest equivalent) sensor
}

export interface HostCpuCore {
  id: number; // N in /proc/stat's cpuN
  usage: number | null; // percentage 0-100
  frequencyMhz: number | null;
}

export interface HostLoadAverage {
  one: number;
  five: number;
  fifteen: number;
}

export interface HostMemory {
  totalBytes: number;
  usedBytes: number; // total - available, the same figure MetricSample.ram is based on
  availableBytes: number;
  cachedBytes: number | null; // buffers + page cache + reclaimable slab, like free's buff/cache
  swapTotalBytes: number | null;
  swapUsedBytes: number | null;
}

export interface HostTemperature {
  id: string; // stable for this boot, e.g. "hwmon3/temp1" or "thermal_zone0"
  chip: string; // hwmon chip name (coretemp, k10temp, nvme, ...) or thermal zone type
  label: string | null;
  celsius: number;
}

export interface HostFilesystem {
  mountpoint: string; // as the host sees it
  device: string;
  type: string;
  totalBytes: number;
  usedBytes: number; // total - available: reserved blocks count as used, like MetricSample.disk
  availableBytes: number;
}

export interface HostDiskIo {
  name: string; // whole-disk device name from /proc/diskstats, e.g. "sda" or "nvme0n1"
  readBytesPerSec: number | null;
  writeBytesPerSec: number | null;
}

export interface HostNetworkInterface {
  name: string;
  rxBytesPerSec: number | null;
  txBytesPerSec: number | null;
}

/** Time ranges GET /api/metrics/history serves. */
export type MetricHistoryRange = "1h" | "24h" | "7d" | "30d";

/** One metric's columns, index-aligned with MetricHistory.ts. Null means no reading. */
export interface MetricHistorySeries {
  avg: Array<number | null>; // time-weighted average over the bucket
  max: Array<number | null>; // highest sample in the bucket
}

/**
 * Response shape for GET /api/metrics/history: columnar arrays, ready to hand to a chart. Buckets
 * without data are left out; where buckets are missing between two points, one entry with every
 * value null sits at the first missing bucket, so a line chart breaks there instead of bridging
 * the gap.
 */
export interface MetricHistory {
  range: MetricHistoryRange;
  resolutionMs: number; // bucket size
  from: number; // ms since epoch, start of the first bucket the range covers
  to: number; // ms since epoch, when the response was built
  ts: number[]; // bucket starts, ascending
  series: {
    cpu: MetricHistorySeries; // percentage 0-100
    memory: MetricHistorySeries; // percentage 0-100
    disk: MetricHistorySeries; // percentage 0-100 of the main disk, like MetricSample.disk
    load1: MetricHistorySeries; // 1-minute load average
    temperature: MetricHistorySeries; // CPU temperature in °C
    netRx: MetricHistorySeries; // bytes/s received, summed over counted interfaces
    netTx: MetricHistorySeries; // bytes/s sent, summed over counted interfaces
    diskRead: MetricHistorySeries; // bytes/s read, summed over physical disks
    diskWrite: MetricHistorySeries; // bytes/s written, summed over physical disks
  };
}

export type MetricHistoryMetric = keyof MetricHistory["series"];

/** Response shape for GET /api/system: facts about the host that rarely change. */
export interface SystemInfo {
  cpuCount: number;
  cpuModel: string | null;
  hostname: string | null;
  kernel: string | null;
  osName: string | null; // PRETTY_NAME from the host's os-release
  platform: string;
  uptimeSeconds: number;
}

/** How a status check reaches a service: an HTTP request, or a plain TCP connect. */
export type StatusCheckMethod = "http" | "tcp";

/** A service's status check settings, as stored on the service. */
export interface ServiceCheckConfig {
  check_enabled: boolean; // off by default, so nothing is contacted until someone asks
  check_method: StatusCheckMethod;
  check_target: string | null; // URL (http) or host:port (tcp); null checks the link URL
  check_interval: number; // seconds between checks
  check_ignore_tls: boolean; // accept self-signed and otherwise untrusted certificates
}

/** Service link stored in the database */
export interface Service extends ServiceCheckConfig {
  id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string | null; // filename of uploaded icon
  icon_source_url: string | null; // URL a downloaded icon came from
  category: string | null; // category name, kept for display and older clients
  category_id: string | null;
  position: number; // order within its category
  open_in_new_tab: boolean;
  created_at: number;
  updated_at: number;
}

/**
 * up: answered in time. degraded: answered, but slower than SLOW_RESPONSE_MS. down: failed
 * FAILURES_BEFORE_DOWN checks in a row (or the first check ever). unknown: not checked yet.
 */
export type ServiceStatusState = "up" | "degraded" | "down" | "unknown";

/** Current status of one service with checks enabled (GET /api/status and the `status` topic). */
export interface ServiceStatus {
  id: string; // service id
  state: ServiceStatusState;
  latencyMs: number | null; // response time of the last successful check
  statusCode: number | null; // HTTP status of the last check, null for TCP or no answer
  error: string | null; // why the last check failed, null when it passed
  checkedAt: number | null; // ms since epoch
  changedAt: number | null; // when it last went down or came back up, ms since epoch
}

/** Response shape for GET /api/status */
export interface ServiceStatusesResponse {
  statuses: ServiceStatus[];
}

/** Time ranges GET /api/status/:id/history serves. */
export type StatusHistoryRange = "24h" | "30d";

export interface StatusHistoryBucket {
  ts: number; // bucket start, ms since epoch
  checks: number;
  failures: number;
  slow: number; // checks that passed but took longer than SLOW_RESPONSE_MS
  latencyMs: number | null; // average response time of the checks that passed
}

/** Response shape for GET /api/status/:id/history, oldest bucket first. */
export interface StatusHistory {
  id: string;
  range: StatusHistoryRange;
  resolutionMs: number; // bucket size
  from: number; // start of the first bucket
  to: number; // when the response was built
  uptime: number | null; // percent of checks that passed, rounded down; null without checks
  buckets: StatusHistoryBucket[];
}

/** A named group of services; empty categories are allowed */
export interface Category {
  id: string;
  name: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Response shape for GET /api/categories */
export interface CategoriesResponse {
  categories: Category[];
}

/** Payload for moving a service to a category (null = uncategorized) at an index */
export interface MoveServicePayload {
  category_id: string | null;
  index: number;
}

/** Payload for reordering services within one category */
export interface ReorderServicesPayload {
  category_id: string | null;
  ids: string[];
}

/** Payload for creating a service; omitted check settings get their defaults (checks off). */
export interface CreateServicePayload extends Partial<ServiceCheckConfig> {
  name: string;
  url: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  category?: string | null;
  open_in_new_tab?: boolean;
}

/** Payload for updating a service */
export interface UpdateServicePayload extends Partial<ServiceCheckConfig> {
  name?: string;
  url?: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  category?: string | null;
  open_in_new_tab?: boolean;
}

/** Response shape for GET /api/metrics */
export interface MetricsResponse {
  samples: MetricSample[];
}

/** Response shape for category ordering */
export interface CategoryOrderResponse {
  order: string[];
}

/** Payload for updating category order */
export interface UpdateCategoryOrderPayload {
  order: string[];
}

/** Payload for renaming a category */
export interface RenameCategoryPayload {
  from: string;
  to: string;
}

/** Response shape for POST /api/categories/rename */
export interface RenameCategoryResponse {
  services: Service[];
  order: string[];
}

/** Response shape for GET /api/services */
export type ServicesResponse = Service[];

/** What a metric alert watches. Disk rules apply to every mounted filesystem. */
export type AlertMetric = "cpu" | "memory" | "disk" | "temperature";

/** One alert rule: fires when the metric stays above the threshold for the duration. */
export interface AlertRule {
  metric: AlertMetric;
  enabled: boolean;
  threshold: number; // percent, or °C for temperature
  durationSec: number;
}

/** A threshold breach, firing until the value drops back below it. */
export interface MetricAlert {
  id: string;
  metric: AlertMetric;
  subject: string | null; // the mountpoint for disk alerts
  threshold: number;
  durationSec: number;
  value: number; // the latest reading
  peak: number;
  startedAt: number; // when the breach began, ms since epoch
  firedAt: number; // when it had lasted long enough to fire
  resolvedAt: number | null;
}

/** Response shape for GET /api/alerts */
export interface AlertsResponse {
  active: MetricAlert[];
  recent: MetricAlert[]; // resolved, newest first
  rules: AlertRule[];
}

/** Where a library icon comes from. */
export type IconLibrarySource = "dashboard-icons" | "selfhst";

/** One icon from the dashboard-icons or selfh.st libraries. */
export interface IconLibraryEntry {
  id: string; // `${source}:${slug}`
  source: IconLibrarySource;
  slug: string;
  name: string;
  url: string; // CDN URL of the preferred format (SVG when there is one)
}

/** Response shape for GET /api/icon-library */
export interface IconLibraryResponse {
  entries: IconLibraryEntry[];
  updatedAt: number; // when the library index was fetched, ms since epoch
}

/** One service in an import preview, ready to be picked and applied. */
export interface ImportPreviewService {
  name: string;
  url: string;
  description: string | null;
  iconUrl: string | null; // resolved from the file or the icon library
  duplicate: boolean; // a service with this URL already exists
}

/** Response shape for POST /api/import/preview */
export interface ImportPreview {
  format: "homepage" | "dashy" | "homer" | "homarr" | "bookmarks" | "orbitdash-seed";
  groups: Array<{ name: string; services: ImportPreviewService[] }>;
  warnings: string[];
}

/** One service to create from an import, with the category it goes in. */
export interface ImportServiceInput {
  name: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  category: string | null;
}

/** Response shape for POST /api/import/apply */
export interface ImportResult {
  created: number;
  failed: Array<{ name: string; error: string }>;
  iconFailures: number; // services created without the icon because it couldn't be downloaded
  snapshot: string | null; // the snapshot taken before importing
}

/** Where notifications go. */
export type NotificationChannelType = "ntfy" | "gotify" | "discord" | "webhook";

/** Which kinds of events a channel receives. */
export interface NotificationEventToggles {
  status: boolean; // a service went down or came back
  alerts: boolean; // a metric alert fired or resolved
}

export interface NtfyChannelConfig {
  server: string; // e.g. https://ntfy.sh
  topic: string; // secret: on a public server, knowing the topic is enough to read it
  token: string | null; // secret: an access token, sent as a Bearer token
  priority: number; // 1-5, for problems; recoveries never go above 3 (ntfy's default)
  tags: string[];
}

export interface GotifyChannelConfig {
  server: string;
  token: string; // secret: the application token
  priority: number; // 0-10, for problems; recoveries never go above 5
}

export interface DiscordChannelConfig {
  webhookUrl: string; // secret: the URL carries the webhook's token
}

export interface WebhookHeader {
  name: string;
  value: string; // secret
}

export interface WebhookChannelConfig {
  url: string; // secret: tokens often travel in the path or query
  headers: WebhookHeader[];
}

interface NotificationChannelBase {
  id: string;
  name: string;
  events: NotificationEventToggles; // both off pauses the channel
  createdAt: number;
  updatedAt: number;
}

/**
 * A notification channel. API responses replace every secret (marked in the config types) with a
 * mask such as "••••a1b2"; the real values never leave the server.
 */
export type NotificationChannel = NotificationChannelBase &
  (
    | { type: "ntfy"; config: NtfyChannelConfig }
    | { type: "gotify"; config: GotifyChannelConfig }
    | { type: "discord"; config: DiscordChannelConfig }
    | { type: "webhook"; config: WebhookChannelConfig }
  );

/** A daily window, in the notification time zone, when messages are held back. */
export interface QuietHours {
  enabled: boolean;
  start: string; // "22:00"
  end: string; // "07:00"; earlier than start means the window crosses midnight
}

export interface NotificationOptions {
  /** How long a service must stay down before anyone is told; 0 sends as soon as it is down. */
  downDelayMinutes: number;
  quietHours: QuietHours;
  timeZone: string | null; // IANA name for quiet hours and times in messages; null: the server's
}

export type NotificationEvent =
  "service.down" | "service.recovered" | "alert.firing" | "alert.resolved" | "summary" | "test";

/** One message sent (or not) to one channel. */
export interface NotificationDelivery {
  id: number;
  channelId: string;
  channelName: string;
  channelType: NotificationChannelType;
  event: NotificationEvent;
  title: string;
  ok: boolean;
  attempts: number;
  error: string | null; // a short reason, never a URL or a token
  sentAt: number;
}

/** Response shape for GET /api/notifications */
export interface NotificationsResponse {
  channels: NotificationChannel[];
  options: NotificationOptions;
  deliveries: NotificationDelivery[]; // newest first
  serverTimeZone: string;
}

/** Response shape for the test endpoints. */
export interface NotificationTestResult {
  ok: boolean;
  error: string | null; // may include the receiving service's own short explanation
  delivery: NotificationDelivery | null; // null for a channel that isn't saved yet
}
