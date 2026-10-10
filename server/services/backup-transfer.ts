import fs from "fs";
import path from "path";
import { z } from "zod";
import { normalizeServiceUrl } from "@shared/urls";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDataDir, getDb } from "../db";
import { createSnapshot } from "./backup-snapshots";
import { detectIconExt, getIconsDir, MAX_ICON_BYTES } from "./icon-storage";

export const BACKUP_FORMAT = "orbitdash-backup";
export const BACKUP_VERSION = 1;

const ICON_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const backupServiceSchema = z.object({
  id: z.string().trim().min(1, "service id is required"),
  name: z.string().trim().min(1, "service name is required"),
  url: z
    .string()
    .trim()
    .refine((value) => normalizeServiceUrl(value) !== null, "service url must be a valid URL"),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  // Added after the first backup files were written, so older exports omit it.
  icon_source_url: z.string().nullable().optional(),
  category: z.string().nullable(),
  open_in_new_tab: z.boolean(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

const backupIconSchema = z.object({
  filename: z.string().regex(ICON_FILENAME_PATTERN, "icon filename is not allowed"),
  data: z.string(),
});

export const backupDocumentSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT, { error: "not an orbitdash backup file" }),
    version: z.literal(BACKUP_VERSION, { error: "unsupported backup version" }),
    exportedAt: z.string(),
    appVersion: z.string().optional(),
    services: z.array(backupServiceSchema),
    settings: z.record(z.string(), z.string()),
    icons: z.array(backupIconSchema),
  })
  .superRefine((document, ctx) => {
    const seen = new Set<string>();
    for (const service of document.services) {
      if (seen.has(service.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate service id "${service.id}"` });
      }
      seen.add(service.id);
    }
  });

export type BackupDocument = z.infer<typeof backupDocumentSchema>;

export interface ImportSummary {
  icons: number;
  services: number;
  snapshot: string;
}

interface ServiceRow {
  id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string | null;
  icon_source_url: string | null;
  category: string | null;
  open_in_new_tab: number;
  created_at: number;
  updated_at: number;
}

function readAppVersion(): string | undefined {
  try {
    const packageJsonPath = path.resolve(import.meta.dirname, "../../package.json");
    return (JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

export function exportBackup(now: Date = new Date()): BackupDocument {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM services ORDER BY category ASC, name ASC")
    .all() as ServiceRow[];
  const settings = db.prepare("SELECT key, value FROM settings ORDER BY key ASC").all() as Array<{
    key: string;
    value: string;
  }>;

  const iconsDir = getIconsDir();
  const icons: BackupDocument["icons"] = [];
  for (const filename of new Set(rows.map((row) => row.icon).filter(Boolean) as string[])) {
    const iconPath = path.join(iconsDir, path.basename(filename));
    if (ICON_FILENAME_PATTERN.test(filename) && fs.existsSync(iconPath)) {
      icons.push({ filename, data: fs.readFileSync(iconPath).toString("base64") });
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion: readAppVersion(),
    services: rows.map((row) => ({ ...row, open_in_new_tab: Boolean(row.open_in_new_tab) })),
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    icons,
  };
}

/** Decodes and checks every icon, keeping only real images within the size limit. */
function decodeIcons(document: BackupDocument): Map<string, Buffer> {
  const icons = new Map<string, Buffer>();
  for (const icon of document.icons) {
    const buffer = Buffer.from(icon.data, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_BYTES || !detectIconExt(buffer)) {
      continue;
    }
    icons.set(icon.filename, buffer);
  }
  return icons;
}

/**
 * Replaces all services, settings and icons with the backup's contents. A pre-import snapshot is
 * taken first, the database swap runs in one transaction, and the icons directory is swapped only
 * after the transaction commits.
 */
export function importBackup(input: unknown): ApiResult<ImportSummary> {
  const parsed = backupDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return apiFail(400, parsed.error.issues[0]?.message ?? "invalid backup file");
  }

  const document = parsed.data;
  const db = getDb();
  const dataDir = getDataDir();
  const iconsDir = getIconsDir();
  const icons = decodeIcons(document);

  const stagingDir = path.join(dataDir, `icons.import-${crypto.randomUUID()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    for (const [filename, buffer] of icons) {
      fs.writeFileSync(path.join(stagingDir, filename), buffer);
    }

    const snapshot = createSnapshot(db, dataDir, "pre-import");

    const insertService = db.prepare(
      `INSERT INTO services (id, name, url, description, icon, icon_source_url, category, open_in_new_tab, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");

    db.transaction(() => {
      db.exec("DELETE FROM services");
      db.exec("DELETE FROM settings");

      for (const service of document.services) {
        const icon = service.icon && icons.has(service.icon) ? service.icon : null;
        insertService.run(
          service.id,
          service.name,
          normalizeServiceUrl(service.url)!,
          service.description?.trim() || null,
          icon,
          icon ? (service.icon_source_url ?? null) : null,
          service.category?.trim() || null,
          service.open_in_new_tab ? 1 : 0,
          service.created_at,
          service.updated_at
        );
      }

      for (const [key, value] of Object.entries(document.settings)) {
        insertSetting.run(key, value);
      }
    })();

    const replacedDir = path.join(dataDir, `icons.replaced-${crypto.randomUUID()}`);
    fs.renameSync(iconsDir, replacedDir);
    fs.renameSync(stagingDir, iconsDir);
    fs.rmSync(replacedDir, { recursive: true, force: true });

    return apiOk({
      icons: icons.size,
      services: document.services.length,
      snapshot: snapshot.name,
    });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
