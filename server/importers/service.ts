import fs from "fs";
import path from "path";
import type { ImportPreview, ImportResult, ImportServiceInput } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { getDataDir, getDb } from "../db";
import { writeLog } from "../observability";
import { createSnapshot } from "../services/backup-snapshots";
import { iconLibrary } from "../services/icon-library";
import { createService, listServices, updateService } from "../services/service-operations";
import { parseImportFile, type ImportedService } from "./formats";

const SEED_APPLIED_KEY = "seed.applied";
// Enough to keep a big import quick without hammering the icon CDNs.
const ICON_CONCURRENCY = 6;

/** The library icon whose name is exactly this, if the library is reachable. */
async function libraryIcon(name: string): Promise<string | null> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const { entries } = await iconLibrary.search(slug, 5);
  return entries.find((entry) => entry.slug === slug)?.url ?? null;
}

async function resolveIcon(
  service: ImportedService,
  warnings: Set<string>
): Promise<string | null> {
  if (service.icon?.kind === "url") return service.icon.url;
  try {
    // A file name from the file, or else the service's own name, e.g. "Jellyfin" -> jellyfin.
    return (
      (service.icon?.kind === "name" ? await libraryIcon(service.icon.name) : null) ??
      (await libraryIcon(service.name))
    );
  } catch {
    warnings.add("The icon library is unavailable, so icons named in the file weren't looked up.");
    return null;
  }
}

/** What a file would import, with icons resolved and links that already exist flagged. */
export async function previewImport(content: string): Promise<ImportPreview> {
  const parsed = parseImportFile(content);
  const existing = new Set(
    listServices().map((service) => normalizeServiceUrl(service.url) ?? service.url)
  );
  const warnings = new Set(parsed.warnings);

  const groups = await Promise.all(
    parsed.groups.map(async (group) => ({
      name: group.name,
      services: await Promise.all(
        group.services.map(async (service) => ({
          name: service.name,
          url: service.url,
          description: service.description,
          iconUrl: await resolveIcon(service, warnings),
          duplicate: existing.has(normalizeServiceUrl(service.url) ?? service.url),
        }))
      ),
    }))
  );

  return { format: parsed.format, groups, warnings: [...warnings] };
}

/**
 * Creates the picked services after a snapshot. Services are created one by one so they keep the
 * file's order; their icons then download a few at a time. An icon that won't download doesn't
 * block its service: it stays without one and is counted.
 */
export async function applyImport(
  services: ImportServiceInput[],
  { snapshot = true }: { snapshot?: boolean } = {}
): Promise<ImportResult> {
  const taken = snapshot ? createSnapshot(getDb(), getDataDir(), "pre-import").name : null;
  const result: ImportResult = { created: 0, failed: [], iconFailures: 0, snapshot: taken };
  const icons: Array<{ id: string; url: string }> = [];

  for (const input of services) {
    const created = await createService({
      payload: {
        name: input.name,
        url: input.url,
        description: input.description,
        category: input.category,
        open_in_new_tab: true,
      },
      iconFile: null,
      removeIcon: false,
    });
    if (!created.success) {
      result.failed.push({ name: input.name, error: created.error });
      continue;
    }
    result.created += 1;
    if (input.iconUrl) icons.push({ id: created.value.id, url: input.iconUrl });
  }

  const queue = [...icons];
  const workers = Array.from({ length: ICON_CONCURRENCY }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const updated = await updateService(next.id, {
        payload: { icon_url: next.url },
        iconFile: null,
        removeIcon: false,
      });
      if (!updated.success) result.iconFailures += 1;
    }
  });
  await Promise.all(workers);
  return result;
}

/**
 * Populates a fresh install from a seed file (`/data/seed.yaml` or `ORBITDASH_SEED_FILE`), in any
 * format the importer reads. Runs once: afterwards the UI is the source of truth.
 */
export async function applySeedIfFresh(
  env: Record<string, string | undefined> = process.env
): Promise<number> {
  const db = getDb();
  const file = env.ORBITDASH_SEED_FILE || path.join(getDataDir(), "seed.yaml");
  const applied = db.prepare("SELECT 1 FROM settings WHERE key = ?").get(SEED_APPLIED_KEY);
  const empty =
    (db.prepare("SELECT COUNT(*) AS count FROM services").get() as { count: number }).count === 0 &&
    (db.prepare("SELECT COUNT(*) AS count FROM categories").get() as { count: number }).count === 0;
  if (applied || !empty || !fs.existsSync(file)) return 0;

  try {
    const preview = await previewImport(fs.readFileSync(file, "utf8"));
    const services = preview.groups.flatMap((group) =>
      group.services.map((service) => ({
        name: service.name,
        url: service.url,
        description: service.description,
        iconUrl: service.iconUrl,
        category: group.name,
      }))
    );
    const result = services.length ? await applyImport(services, { snapshot: false }) : null;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      SEED_APPLIED_KEY,
      JSON.stringify({ file, at: Date.now() })
    );
    writeLog("info", "seed.applied", { file, created: result?.created ?? 0 });
    return result?.created ?? 0;
  } catch (error) {
    writeLog("warn", "seed.failed", {
      file,
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
