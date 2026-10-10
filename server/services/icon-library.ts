import fs from "fs";
import path from "path";
import type { IconLibraryEntry, IconLibraryResponse } from "@shared/types";
import { getDataDir } from "../db";

const DASHBOARD_ICONS_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";
const SELFHST_BASE = "https://cdn.jsdelivr.net/gh/selfhst/icons";
export const DASHBOARD_ICONS_INDEX = `${DASHBOARD_ICONS_BASE}/metadata.json`;
export const SELFHST_INDEX = `${SELFHST_BASE}/index.json`;

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_INDEX_BYTES = 10 * 1024 * 1024;
export const MAX_RESULTS = 60;

interface Library {
  entries: IndexedEntry[];
  updatedAt: number;
}

interface IndexedEntry extends IconLibraryEntry {
  /** Lowercase words to match against: slug, name and aliases. */
  terms: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** dashboard-icons' metadata.json: `{ [slug]: { base: "svg" | "png", aliases: string[] } }`. */
export function parseDashboardIcons(input: unknown): IndexedEntry[] {
  if (!isRecord(input)) return [];
  const entries: IndexedEntry[] = [];
  for (const [slug, meta] of Object.entries(input)) {
    if (!SLUG_PATTERN.test(slug) || !isRecord(meta)) continue;
    const base = meta.base === "png" ? "png" : "svg";
    const aliases = Array.isArray(meta.aliases)
      ? meta.aliases.filter((alias): alias is string => typeof alias === "string")
      : [];
    entries.push({
      id: `dashboard-icons:${slug}`,
      source: "dashboard-icons",
      slug,
      name: titleFromSlug(slug),
      url: `${DASHBOARD_ICONS_BASE}/${base}/${slug}.${base}`,
      terms: [slug, ...aliases.map((alias) => alias.toLowerCase())],
    });
  }
  return entries;
}

/** selfh.st's index.json: `[{ Name, Reference, SVG: "Yes" | "No", Tags }]`. */
export function parseSelfhst(input: unknown): IndexedEntry[] {
  if (!Array.isArray(input)) return [];
  const entries: IndexedEntry[] = [];
  for (const item of input) {
    if (!isRecord(item) || typeof item.Reference !== "string") continue;
    const slug = item.Reference;
    if (!SLUG_PATTERN.test(slug)) continue;
    const format = item.SVG === "Yes" ? "svg" : "png";
    const name =
      typeof item.Name === "string" && item.Name.trim() ? item.Name.trim() : titleFromSlug(slug);
    const tags =
      typeof item.Tags === "string"
        ? item.Tags.split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean)
        : [];
    entries.push({
      id: `selfhst:${slug}`,
      source: "selfhst",
      slug,
      name,
      url: `${SELFHST_BASE}/${format}/${slug}.${format}`,
      terms: [slug, name.toLowerCase(), ...tags],
    });
  }
  return entries;
}

function normalizeQuery(query: string): string[] {
  const lower = query.trim().toLowerCase();
  if (!lower) return [];
  // "Home Assistant" should find "home-assistant" and "homeassistant".
  return [...new Set([lower, lower.replace(/\s+/g, "-"), lower.replace(/[\s.-]+/g, "")])];
}

function scoreEntry(entry: IndexedEntry, needles: string[]): number {
  let best = 0;
  for (const needle of needles) {
    for (const [index, term] of entry.terms.entries()) {
      // The slug (first term) counts a little more than names, aliases and tags.
      const bonus = index === 0 ? 5 : 0;
      if (term === needle) best = Math.max(best, 100 + bonus);
      else if (term.startsWith(needle))
        best = Math.max(best, 80 + bonus - Math.min(10, term.length - needle.length));
      else if (term.includes(needle)) best = Math.max(best, 50 + bonus);
    }
  }
  return best;
}

/** The best matches for a query, both libraries mixed, best first. */
export function searchLibrary(library: Library, query: string, limit = 48): IconLibraryEntry[] {
  const needles = normalizeQuery(query);
  if (needles.length === 0) return [];
  return library.entries
    .map((entry) => ({ entry, score: scoreEntry(entry, needles) }))
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.slug.length - right.entry.slug.length ||
        left.entry.slug.localeCompare(right.entry.slug) ||
        left.entry.source.localeCompare(right.entry.source)
    )
    .slice(0, Math.min(limit, MAX_RESULTS))
    .map(({ entry: { terms: _terms, ...entry } }) => entry);
}

export interface IconLibraryDependencies {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  cacheFile: () => string;
}

const defaultDependencies: IconLibraryDependencies = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  cacheFile: () => path.join(getDataDir(), "cache", "icon-library.json"),
};

async function fetchJson(deps: IconLibraryDependencies, url: string): Promise<unknown> {
  const response = await deps.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_INDEX_BYTES) throw new Error(`${url} is unexpectedly large`);
  return JSON.parse(text);
}

/**
 * The combined icon index, fetched from jsDelivr once a day and kept on disk so restarts and
 * outages still have it. One library failing still leaves the other; both failing with nothing
 * cached throws, and the route reports the library as unavailable.
 */
export function createIconLibrary(deps: IconLibraryDependencies = defaultDependencies) {
  let library: Library | null = null;
  let loading: Promise<Library> | null = null;

  function readCache(): Library | null {
    try {
      const cached = JSON.parse(fs.readFileSync(deps.cacheFile(), "utf8")) as unknown;
      if (!isRecord(cached) || typeof cached.updatedAt !== "number") return null;
      const entries = [
        ...parseDashboardIcons(cached.dashboardIcons),
        ...parseSelfhst(cached.selfhst),
      ];
      return entries.length > 0 ? { entries, updatedAt: cached.updatedAt } : null;
    } catch {
      return null;
    }
  }

  async function refresh(): Promise<Library> {
    const [dashboardIcons, selfhst] = await Promise.allSettled([
      fetchJson(deps, DASHBOARD_ICONS_INDEX),
      fetchJson(deps, SELFHST_INDEX),
    ]);
    const raw = {
      dashboardIcons: dashboardIcons.status === "fulfilled" ? dashboardIcons.value : null,
      selfhst: selfhst.status === "fulfilled" ? selfhst.value : null,
    };
    const entries = [...parseDashboardIcons(raw.dashboardIcons), ...parseSelfhst(raw.selfhst)];
    if (entries.length === 0) throw new Error("the icon libraries could not be reached");

    const next = { entries, updatedAt: deps.now() };
    try {
      fs.mkdirSync(path.dirname(deps.cacheFile()), { recursive: true });
      fs.writeFileSync(deps.cacheFile(), JSON.stringify({ ...raw, updatedAt: next.updatedAt }));
    } catch {
      // A read-only data directory only costs the on-disk copy.
    }
    return next;
  }

  async function get(): Promise<Library> {
    library ??= readCache();
    const stale = !library || deps.now() - library.updatedAt > REFRESH_AFTER_MS;
    if (!stale) return library!;

    loading ??= refresh().finally(() => {
      loading = null;
    });
    if (library) {
      // Serve what we have; the refresh finishes in the background.
      loading.then(
        (fresh) => (library = fresh),
        () => undefined
      );
      return library;
    }
    library = await loading;
    return library;
  }

  return {
    async search(query: string, limit?: number): Promise<IconLibraryResponse> {
      const current = await get();
      return { entries: searchLibrary(current, query, limit), updatedAt: current.updatedAt };
    },
    resetForTesting() {
      library = null;
      loading = null;
    },
  };
}

export const iconLibrary = createIconLibrary();
