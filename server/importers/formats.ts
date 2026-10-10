import { parse as parseYaml } from "yaml";

export type ImportFormat =
  "homepage" | "dashy" | "homer" | "homarr" | "bookmarks" | "orbitdash-seed";

/** A link to import before icons are resolved: a URL, or a library name like "plex". */
export interface ImportedService {
  name: string;
  url: string;
  description: string | null;
  icon: { kind: "url"; url: string } | { kind: "name"; name: string } | null;
}

export interface ImportedGroup {
  name: string;
  services: ImportedService[];
}

export interface ParsedImport {
  format: ImportFormat;
  groups: ImportedGroup[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** An http(s) URL as written, or null; dashboards often hold placeholders or relative links. */
function httpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Icon references the other dashboards use: full URLs, file names or paths from dashboard-icons
 * ("plex.png", "sh-plex", "hl-plex", "assets/plex.png"), or icon fonts (Material, Simple Icons,
 * Font Awesome) that have no image to download.
 */
export function iconHint(
  value: unknown,
  warnings: string[],
  context: string
): ImportedService["icon"] {
  const raw = text(value);
  if (!raw || /^(favicon|generative)/i.test(raw)) return null;
  if (httpUrl(raw)) return { kind: "url", url: raw };
  if (/^(mdi|si)[-:]/i.test(raw) || /^fa[srb]?[\s-]/i.test(raw)) {
    warnings.push(`${context}: icon font "${raw}" can't be imported; pick an icon later.`);
    return null;
  }
  const name = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/^(sh|hl|di|dashboard-icons)[-:]/i, "")
    .replace(/\.(png|svg|webp|jpe?g)$/i, "")
    .toLowerCase();
  return /^[a-z0-9][a-z0-9.-]*$/.test(name) ? { kind: "name", name } : null;
}

function service(
  name: unknown,
  url: unknown,
  description: unknown,
  icon: unknown,
  warnings: string[]
): ImportedService | null {
  const label = text(name);
  const link = httpUrl(url);
  if (!label) return null;
  if (!link) {
    warnings.push(`${label}: skipped because it has no http or https link.`);
    return null;
  }
  return {
    name: label,
    url: link,
    description: text(description),
    icon: iconHint(icon, warnings, label),
  };
}

function finish(format: ImportFormat, groups: ImportedGroup[], warnings: string[]): ParsedImport {
  return { format, groups: groups.filter((group) => group.services.length > 0), warnings };
}

/** Homepage services.yaml: `- Group: [ - Service: { href, description, icon } ]`, groups may nest. */
export function parseHomepage(input: unknown): ParsedImport {
  const warnings: string[] = [];
  const groups: ImportedGroup[] = [];

  const walk = (entries: unknown, groupName: string) => {
    if (!Array.isArray(entries)) return;
    const group: ImportedGroup = { name: groupName, services: [] };
    groups.push(group);
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      for (const [name, value] of Object.entries(entry)) {
        if (Array.isArray(value)) {
          // A nested group: its own category, named after both levels.
          walk(value, `${groupName} / ${name}`);
        } else if (isRecord(value)) {
          const parsed = service(name, value.href, value.description, value.icon, warnings);
          if (parsed) group.services.push(parsed);
        }
      }
    }
  };

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!isRecord(entry)) continue;
      for (const [name, value] of Object.entries(entry)) walk(value, name);
    }
  }
  return finish("homepage", groups, warnings);
}

/** Dashy conf.yml: `sections: [{ name, items: [{ title, url, description, icon }] }]`. */
export function parseDashy(input: unknown): ParsedImport {
  const warnings: string[] = [];
  const sections = isRecord(input) && Array.isArray(input.sections) ? input.sections : [];
  const groups = sections.filter(isRecord).map((section) => ({
    name: text(section.name) ?? "Imported",
    services: (Array.isArray(section.items) ? section.items : [])
      .filter(isRecord)
      .map((item) => service(item.title, item.url, item.description, item.icon, warnings))
      .filter((item): item is ImportedService => item !== null),
  }));
  return finish("dashy", groups, warnings);
}

/** Homer config.yml: `services: [{ name, items: [{ name, url, subtitle, logo | icon }] }]`. */
export function parseHomer(input: unknown): ParsedImport {
  const warnings: string[] = [];
  const sections = isRecord(input) && Array.isArray(input.services) ? input.services : [];
  const groups = sections.filter(isRecord).map((section) => ({
    name: text(section.name) ?? "Imported",
    services: (Array.isArray(section.items) ? section.items : [])
      .filter(isRecord)
      .map((item) => service(item.name, item.url, item.subtitle, item.logo ?? item.icon, warnings))
      .filter((item): item is ImportedService => item !== null),
  }));
  return finish("homer", groups, warnings);
}

/**
 * Homarr's classic JSON export: `apps: [{ name, url, behaviour: { externalUrl }, appearance:
 * { iconUrl }, area: { type, properties: { id } } }]` with `categories` and `wrappers` naming
 * the areas apps sit in.
 */
export function parseHomarr(input: unknown): ParsedImport {
  const warnings: string[] = [];
  if (!isRecord(input) || !Array.isArray(input.apps)) return finish("homarr", [], warnings);

  const areaNames = new Map<string, string>();
  for (const list of [input.categories, input.wrappers]) {
    if (!Array.isArray(list)) continue;
    for (const area of list.filter(isRecord)) {
      const id = text(area.id);
      if (id) areaNames.set(id, text(area.name) ?? "Imported");
    }
  }

  const groups = new Map<string, ImportedGroup>();
  for (const app of input.apps.filter(isRecord)) {
    const behaviour = isRecord(app.behaviour) ? app.behaviour : {};
    const appearance = isRecord(app.appearance) ? app.appearance : {};
    const area = isRecord(app.area) && isRecord(app.area.properties) ? app.area.properties : {};
    const groupName = areaNames.get(text(area.id) ?? "") ?? "Imported";
    const parsed = service(
      app.name,
      httpUrl(behaviour.externalUrl) ?? app.url,
      null,
      appearance.iconUrl,
      warnings
    );
    if (!parsed) continue;
    const group = groups.get(groupName) ?? { name: groupName, services: [] };
    group.services.push(parsed);
    groups.set(groupName, group);
  }
  return finish("homarr", [...groups.values()], warnings);
}

const decodeEntities = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** The text of an HTML fragment: tags and any stray angle brackets removed, entities decoded. */
const fragmentText = (html: string) =>
  decodeEntities(
    html
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .trim()
  );

/** Browser bookmarks (Netscape HTML): folders become categories, named after their path. */
export function parseBookmarks(html: string): ParsedImport {
  const warnings: string[] = [];
  const groups = new Map<string, ImportedGroup>();
  const folders: string[] = [];
  let pendingFolder: string | null = null;

  const token = /<h3[^>]*>([\s\S]*?)<\/h3>|<dl[^>]*>|<\/dl>|<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    const tag = match[0].slice(0, 3).toLowerCase();
    if (match[1] !== undefined) {
      pendingFolder = fragmentText(match[1]);
    } else if (tag.startsWith("<dl")) {
      if (pendingFolder !== null) folders.push(pendingFolder);
      else folders.push("");
      pendingFolder = null;
    } else if (tag === "</d") {
      folders.pop();
    } else {
      const href = /href\s*=\s*"([^"]*)"/i.exec(match[2] ?? "")?.[1];
      const name = fragmentText(match[3] ?? "");
      const parsed = service(name, href && decodeEntities(href), null, null, warnings);
      if (!parsed) continue;
      const path = folders.filter(Boolean);
      // Browsers wrap everything in a toolbar folder; drop that outer level from the name.
      const groupName = (path.length > 1 ? path.slice(1) : path).join(" / ") || "Bookmarks";
      const group = groups.get(groupName) ?? { name: groupName, services: [] };
      group.services.push(parsed);
      groups.set(groupName, group);
    }
  }
  return finish("bookmarks", [...groups.values()], warnings);
}

/** orbitdash's own seed format: `categories: [{ name, services: [{ name, url, description, icon }] }]`. */
export function parseSeed(input: unknown): ParsedImport {
  const warnings: string[] = [];
  const categories = isRecord(input) && Array.isArray(input.categories) ? input.categories : [];
  const groups = categories.filter(isRecord).map((category) => ({
    name: text(category.name) ?? "Imported",
    services: (Array.isArray(category.services) ? category.services : [])
      .filter(isRecord)
      .map((item) => service(item.name, item.url, item.description, item.icon, warnings))
      .filter((item): item is ImportedService => item !== null),
  }));
  return finish("orbitdash-seed", groups, warnings);
}

export class ImportFormatError extends Error {}

/** Recognizes a file from the other dashboards by its content and parses it. */
export function parseImportFile(content: string): ParsedImport {
  const trimmed = content.trim();
  if (
    /^<!doctype netscape-bookmark-file/i.test(trimmed) ||
    /<dl[\s>]/i.test(trimmed.slice(0, 4000))
  ) {
    return parseBookmarks(content);
  }

  let data: unknown;
  try {
    // YAML is a superset of JSON, so one parser reads Homarr's JSON too.
    data = parseYaml(content, { maxAliasCount: 100 });
  } catch {
    throw new ImportFormatError("That file isn't valid YAML, JSON or bookmarks HTML.");
  }

  if (Array.isArray(data)) return parseHomepage(data);
  if (isRecord(data)) {
    if (Array.isArray(data.apps)) return parseHomarr(data);
    if (Array.isArray(data.sections)) return parseDashy(data);
    if (Array.isArray(data.services)) return parseHomer(data);
    if (Array.isArray(data.categories)) return parseSeed(data);
  }
  throw new ImportFormatError(
    "This doesn't look like a Homepage, Dashy, Homer, Homarr or bookmarks file."
  );
}
