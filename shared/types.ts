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

/** Service link stored in the database */
export interface Service {
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

/** Payload for creating a service */
export interface CreateServicePayload {
  name: string;
  url: string;
  description?: string | null;
  icon?: string | null;
  icon_url?: string | null;
  category?: string | null;
  open_in_new_tab?: boolean;
}

/** Payload for updating a service */
export interface UpdateServicePayload {
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
