import type { ContainerInfo, DiscoverySuggestion, Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { getDb } from "../db";
import { iconHint } from "../importers/formats";
import { resolveIcon } from "../importers/service";
import { iconLibrary } from "../services/icon-library";

const DISMISSED_KEY = "discovery.dismissed";
const MAX_DISMISSED = 500;

/** Container ports that usually serve a web UI, best first. */
const WEB_PORTS = [80, 443, 8080, 8443, 3000, 8000, 8096, 9000, 5000, 8081, 8888, 9090];
/** Ports that are almost never something to open in a browser. */
const NON_WEB_PORTS = new Set([
  21, 22, 25, 53, 110, 143, 389, 445, 465, 587, 993, 995, 1883, 3306, 5432, 5672, 6379, 8883, 11211,
  27017, 51820,
]);

export interface LabeledContainer {
  container: ContainerInfo;
  labels: Record<string, string>;
}

function readDismissed(): string[] {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(DISMISSED_KEY) as
    { value: string } | undefined;
  try {
    const parsed = row ? (JSON.parse(row.value) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(DISMISSED_KEY, JSON.stringify(keys.slice(-MAX_DISMISSED)));
}

export function dismissSuggestion(key: string): void {
  const dismissed = readDismissed();
  if (!dismissed.includes(key)) writeDismissed([...dismissed, key]);
}

export function restoreDismissed(): number {
  const count = readDismissed().length;
  writeDismissed([]);
  return count;
}

export function dismissedCount(): number {
  return readDismissed().length;
}

/** The published TCP port most likely to be a web UI, or null when none looks like one. */
export function webPort(ports: ContainerInfo["ports"]): number | null {
  const tcp = ports.filter(
    (port) => port.protocol === "tcp" && !NON_WEB_PORTS.has(port.privatePort)
  );
  if (tcp.length === 0) return null;
  const ranked = [...tcp].sort((a, b) => {
    const rank = (port: (typeof tcp)[number]) => {
      const index = WEB_PORTS.indexOf(port.privatePort);
      return index === -1 ? WEB_PORTS.length : index;
    };
    return rank(a) - rank(b) || a.publicPort - b.publicPort;
  });
  return ranked[0].publicPort;
}

/** "media-jellyfin-1" -> "jellyfin": compose's project prefix and replica suffix come off. */
function baseName(container: ContainerInfo, labels: Record<string, string>): string {
  const service = labels["com.docker.compose.service"];
  if (service) return service;
  const name = container.name.replace(/[-_]\d+$/, "");
  return container.composeProject && name.startsWith(`${container.composeProject}-`)
    ? name.slice(container.composeProject.length + 1)
    : name;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** The library's own spelling and icon for a name ("qbittorrent" -> qBittorrent), if it has one. */
async function libraryMatch(name: string): Promise<{ name: string; url: string } | null> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  try {
    const { entries } = await iconLibrary.search(slug, 5);
    const entry = entries.find((candidate) => candidate.slug === slug);
    return entry ? { name: entry.name, url: entry.url } : null;
  } catch {
    return null;
  }
}

const text = (value: string | undefined) => value?.trim() || null;

/**
 * Running containers that aren't on the dashboard yet: ones with orbitdash.* or homepage.* labels
 * first, then ones publishing a web port. A container is left out once a service uses its link
 * (or, for a port, the same port), when it's dismissed, or when it opts out with
 * `orbitdash.enable=false`.
 */
export async function buildSuggestions(
  containers: readonly LabeledContainer[],
  services: readonly Service[],
  dismissed: readonly string[] = readDismissed()
): Promise<DiscoverySuggestion[]> {
  const serviceUrls = new Set(
    services.map((service) => normalizeServiceUrl(service.url) ?? service.url)
  );
  const servicePorts = new Set(
    services.flatMap((service) => {
      try {
        const url = new URL(service.url);
        return [Number(url.port || (url.protocol === "https:" ? 443 : 80))];
      } catch {
        return [];
      }
    })
  );

  const suggestions: DiscoverySuggestion[] = [];
  for (const { container, labels } of containers) {
    if (container.state !== "running" || dismissed.includes(container.name)) continue;
    if (/orbitdash/i.test(container.image)) continue;
    if (/^(false|no|0|off)$/i.test(labels["orbitdash.enable"] ?? "")) continue;

    const labelUrl = text(labels["orbitdash.url"]) ?? text(labels["homepage.href"]);
    const url = labelUrl ? normalizeServiceUrl(labelUrl) : null;
    const labeled = Object.keys(labels).some(
      (key) => key.startsWith("orbitdash.") || key.startsWith("homepage.")
    );
    const port = url ? null : webPort(container.ports);
    if (!url && port === null) continue;
    if (url && serviceUrls.has(url)) continue;
    if (port !== null && servicePorts.has(port)) continue;

    const base = baseName(container, labels);
    const labelName = text(labels["orbitdash.name"]) ?? text(labels["homepage.name"]);
    const match = labelName ? null : await libraryMatch(base);
    const name = (labelName ?? match?.name ?? titleCase(base)).slice(0, 100);
    const iconLabel = text(labels["orbitdash.icon"]) ?? text(labels["homepage.icon"]);
    let iconUrl = match?.url ?? null;
    if (iconLabel || !iconUrl) {
      const warnings = new Set<string>();
      iconUrl =
        (await resolveIcon(
          { name, url: url ?? "", description: null, icon: iconHint(iconLabel, [], name) },
          warnings
        )) ?? iconUrl;
    }

    suggestions.push({
      key: container.name,
      name,
      url,
      port,
      iconUrl,
      category: text(labels["orbitdash.category"]) ?? text(labels["homepage.group"]),
      description: text(labels["orbitdash.description"]) ?? text(labels["homepage.description"]),
      source: labeled ? "labels" : "port",
    });
  }
  return suggestions.sort(
    (a, b) =>
      Number(a.source === "port") - Number(b.source === "port") || a.name.localeCompare(b.name)
  );
}
