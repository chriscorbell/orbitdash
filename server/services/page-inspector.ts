import type { ServiceInspection } from "@shared/types";
import { describeCheckError } from "../status/checker";

const FETCH_TIMEOUT_MS = 6_000;
/** The head of a page is enough; most apps put their title and icons in the first few KB. */
const MAX_HTML_BYTES = 256 * 1024;
const MAX_NAME_LENGTH = 60;
const USER_AGENT = "orbitdash";

type FetchInit = RequestInit & { tls?: { rejectUnauthorized: boolean } };

export interface InspectorDependencies {
  fetch: (url: string, init: FetchInit) => Promise<Response>;
}

const defaultDependencies: InspectorDependencies = {
  fetch: (url, init) => fetch(url, init),
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const clean = (value: string | undefined | null): string | null => {
  const text = value ? decodeEntities(value).replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 200) : null;
};

/** Attributes of one tag, lowercased names: `<meta name="x" content="y">` -> { name, content }. */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([a-z][a-z0-9:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  for (let match = pattern.exec(tag); match; match = pattern.exec(tag)) {
    result[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return result;
}

/** Largest dimension in a `sizes` attribute ("32x32 192x192"), "any" counting as large. */
function iconSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 512;
  return Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map((match) => Number(match[1])));
}

/** Page names apps put in front of their own name, as in "Dashboard - Grafana". */
const GENERIC_PAGE_NAMES = new Set([
  "admin",
  "dashboard",
  "home",
  "index",
  "log in",
  "login",
  "main",
  "overview",
  "settings",
  "sign in",
  "signin",
  "start",
  "status",
  "welcome",
]);

/**
 * The app's name in a page title: "Pi-hole - raspberrypi" -> "Pi-hole", but "Dashboard - Grafana"
 * -> "Grafana", skipping the generic page names apps often lead with.
 */
export function nameFromTitle(title: string): string {
  const parts = title
    .split(/\s+[-|–—·•:]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const name = parts.find((part) => !GENERIC_PAGE_NAMES.has(part.toLowerCase())) ?? title;
  return name.slice(0, MAX_NAME_LENGTH);
}

export interface PageMetadata {
  name: string | null;
  iconUrl: string | null;
}

/** The service name and best icon in an HTML document, icon links resolved against `baseUrl`. */
export function readPageMetadata(html: string, baseUrl: string): PageMetadata {
  const head = html.slice(0, MAX_HTML_BYTES);
  const meta: Record<string, string> = {};
  let base = baseUrl;
  const icons: Array<{ href: string; score: number }> = [];

  for (const match of head.matchAll(/<(meta|link|base)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    if (tag === "meta") {
      const key = (attrs.name ?? attrs.property ?? "").toLowerCase();
      if (key && attrs.content) meta[key] = attrs.content;
    } else if (tag === "base" && attrs.href) {
      try {
        base = new URL(attrs.href, baseUrl).toString();
      } catch {
        // Keep the page's own URL.
      }
    } else {
      const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
      if (!attrs.href || rel.includes("mask-icon")) continue;
      if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
        icons.push({ href: attrs.href, score: 1000 + iconSize(attrs.sizes || "180x180") });
      } else if (rel.includes("icon")) {
        const svg = /\.svg(\?|$)/i.test(attrs.href) || attrs.type === "image/svg+xml";
        icons.push({ href: attrs.href, score: svg ? 900 : iconSize(attrs.sizes) });
      }
    }
  }

  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]);
  const name =
    clean(meta["application-name"]) ??
    clean(meta["apple-mobile-web-app-title"]) ??
    clean(meta["og:site_name"]) ??
    (title ? nameFromTitle(title) : null);

  const best = icons.sort((a, b) => b.score - a.score)[0];
  let iconUrl: string | null = null;
  try {
    const resolved = new URL(best ? decodeEntities(best.href) : "/favicon.ico", base);
    if (resolved.protocol === "http:" || resolved.protocol === "https:") {
      iconUrl = resolved.toString();
    }
  } catch {
    iconUrl = null;
  }
  return { name: name ? name.slice(0, MAX_NAME_LENGTH) : null, iconUrl };
}

async function readHead(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_HTML_BYTES));
}

const isCertificateError = (error: unknown) =>
  describeCheckError(error, "") === "Certificate not trusted";

/**
 * Reads a link's page for a name and an icon, following the same rules as icon downloads:
 * http(s) only, a short deadline and a size cap, and LAN hosts allowed (they're the point). A page
 * behind a self-signed certificate is read anyway, since only its title and icon are used, and
 * reported so the form can suggest accepting it for status checks.
 */
export function createPageInspector(deps: InspectorDependencies = defaultDependencies) {
  async function get(url: string, ignoreTls: boolean): Promise<Response> {
    return deps.fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.5", "User-Agent": USER_AGENT },
      ...(ignoreTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
  }

  return async function inspect(url: string): Promise<ServiceInspection> {
    const empty = { url, name: null, iconUrl: null, selfSigned: false };
    let response: Response;
    let selfSigned = false;
    try {
      try {
        response = await get(url, false);
      } catch (error) {
        if (!isCertificateError(error)) throw error;
        response = await get(url, true);
        selfSigned = true;
      }
    } catch (error) {
      return { ...empty, reachable: false, error: describeCheckError(error, "Couldn't reach it") };
    }

    const finalUrl = response.url || url;
    const type = response.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) {
      response.body?.cancel().catch(() => {});
      return {
        ...empty,
        selfSigned,
        reachable: response.ok,
        error: response.ok ? null : `HTTP ${response.status}`,
        iconUrl: readPageMetadata("", finalUrl).iconUrl,
      };
    }

    const metadata = readPageMetadata(await readHead(response), finalUrl);
    return {
      url,
      // A login page still names the app, so its metadata is used even on 401 and 403.
      reachable: response.ok || response.status === 401 || response.status === 403,
      error: response.ok ? null : `HTTP ${response.status}`,
      name: metadata.name,
      iconUrl: metadata.iconUrl,
      selfSigned,
    };
  };
}

export const inspectPage = createPageInspector();
