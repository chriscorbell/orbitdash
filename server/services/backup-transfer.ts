import fs from "fs";
import path from "path";
import { z } from "zod";
import { CATEGORY_ORDER_SETTING_KEY, mergeCategoryOrder } from "@shared/category-order";
import { WALLPAPER_FILENAME_PATTERN } from "@shared/dashboard-settings";
import {
  CHECK_INTERVAL_MAX_S,
  CHECK_INTERVAL_MIN_S,
  DEFAULT_CHECK_CONFIG,
  normalizeCheckTarget,
  STATUS_CHECK_METHODS,
} from "@shared/status";
import { normalizeServiceUrl } from "@shared/urls";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDataDir, getDb } from "../db";
import { createSnapshot } from "./backup-snapshots";
import { detectIconExt, getIconsDir, MAX_ICON_BYTES } from "./icon-storage";
import { listReferencedWallpapers, saveWallpaper, wallpaperPath } from "./wallpaper-storage";

export const BACKUP_FORMAT = "orbitdash-backup";
export const BACKUP_VERSION = 2;

const ICON_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const serviceFields = {
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
  open_in_new_tab: z.boolean(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  // Status checks came later too; a backup without them imports with checks off.
  check_enabled: z.boolean().optional(),
  check_method: z.enum(STATUS_CHECK_METHODS).optional(),
  check_target: z.string().nullable().optional(),
  check_interval: z.number().int().min(CHECK_INTERVAL_MIN_S).max(CHECK_INTERVAL_MAX_S).optional(),
  check_ignore_tls: z.boolean().optional(),
};

/** A check target that doesn't suit its method would only ever fail, so the file is rejected. */
function rejectInvalidCheckTarget(
  service: { check_method?: "http" | "tcp"; check_target?: string | null; name: string },
  ctx: z.RefinementCtx
) {
  const target = normalizeCheckTarget(
    service.check_method ?? DEFAULT_CHECK_CONFIG.check_method,
    service.check_target
  );
  if (!target.ok) {
    ctx.addIssue({ code: "custom", message: `${service.name}: ${target.error}` });
  }
}

/** Version 1 (orbitdash 0.2): categories were a free-text name on each service. */
const backupServiceV1Schema = z
  .object({ ...serviceFields, category: z.string().nullable() })
  .superRefine(rejectInvalidCheckTarget);

const backupServiceSchema = z
  .object({
    ...serviceFields,
    category_id: z.string().nullable(),
    position: z.number().int(),
  })
  .superRefine(rejectInvalidCheckTarget);

const backupCategorySchema = z.object({
  id: z.string().trim().min(1, "category id is required"),
  name: z.string().trim().min(1, "category name is required"),
  position: z.number().int(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

const backupIconSchema = z.object({
  filename: z.string().regex(ICON_FILENAME_PATTERN, "icon filename is not allowed"),
  data: z.string(),
});

const backupWallpaperSchema = z.object({
  filename: z.string().regex(WALLPAPER_FILENAME_PATTERN, "wallpaper filename is not allowed"),
  data: z.string(),
});

const documentFields = {
  format: z.literal(BACKUP_FORMAT, { error: "not an orbitdash backup file" }),
  exportedAt: z.string(),
  appVersion: z.string().optional(),
  settings: z.record(z.string(), z.string()),
  icons: z.array(backupIconSchema),
  // Added after version 2 shipped, so older files simply have none.
  wallpapers: z.array(backupWallpaperSchema).default([]),
};

function rejectDuplicateIds(label: string, ids: string[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      ctx.addIssue({ code: "custom", message: `duplicate ${label} id "${id}"` });
    }
    seen.add(id);
  }
}

const backupDocumentV1Schema = z
  .object({ ...documentFields, version: z.literal(1), services: z.array(backupServiceV1Schema) })
  .superRefine((document, ctx) =>
    rejectDuplicateIds(
      "service",
      document.services.map((service) => service.id),
      ctx
    )
  );

const backupDocumentV2Schema = z
  .object({
    ...documentFields,
    version: z.literal(2),
    categories: z.array(backupCategorySchema),
    services: z.array(backupServiceSchema),
  })
  .superRefine((document, ctx) => {
    rejectDuplicateIds(
      "service",
      document.services.map((service) => service.id),
      ctx
    );
    rejectDuplicateIds(
      "category",
      document.categories.map((category) => category.id),
      ctx
    );
  });

const backupEnvelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { error: "not an orbitdash backup file" }),
  version: z.union([z.literal(1), z.literal(2)], { error: "unsupported backup version" }),
});

export const backupDocumentSchema = backupDocumentV2Schema;

export type BackupDocument = z.infer<typeof backupDocumentV2Schema>;
type BackupDocumentV1 = z.infer<typeof backupDocumentV1Schema>;

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
  category_id: string | null;
  position: number;
  open_in_new_tab: number;
  created_at: number;
  updated_at: number;
  check_enabled: number;
  check_method: "http" | "tcp";
  check_target: string | null;
  check_interval: number;
  check_ignore_tls: number;
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
    .prepare(
      `SELECT id, name, url, description, icon, icon_source_url, category_id, position,
              open_in_new_tab, created_at, updated_at,
              check_enabled, check_method, check_target, check_interval, check_ignore_tls
       FROM services ORDER BY category_id ASC, position ASC, name ASC`
    )
    .all() as ServiceRow[];
  const categories = db
    .prepare(
      "SELECT id, name, position, created_at, updated_at FROM categories ORDER BY position ASC"
    )
    .all() as BackupDocument["categories"];
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

  const wallpapers: BackupDocument["wallpapers"] = [];
  for (const filename of listReferencedWallpapers()) {
    const filePath = wallpaperPath(filename);
    if (filePath && fs.existsSync(filePath)) {
      wallpapers.push({ filename, data: fs.readFileSync(filePath).toString("base64") });
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion: readAppVersion(),
    categories,
    services: rows.map((row) => ({
      ...row,
      open_in_new_tab: Boolean(row.open_in_new_tab),
      check_enabled: Boolean(row.check_enabled),
      check_ignore_tls: Boolean(row.check_ignore_tls),
    })),
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    icons,
    wallpapers,
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

function parseLegacyOrder(savedOrder: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(savedOrder ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/** Brings a version 1 backup to the current shape: categories from names, alphabetical order. */
function upgradeV1Document(document: BackupDocumentV1): BackupDocument {
  const { [CATEGORY_ORDER_SETTING_KEY]: savedOrder, ...settings } = document.settings;
  const parsedOrder = parseLegacyOrder(savedOrder);

  const names = document.services
    .map((service) => service.category?.trim())
    .filter((name): name is string => Boolean(name));
  const now = Date.now();
  const categories = mergeCategoryOrder(names, parsedOrder).map((name, position) => ({
    id: crypto.randomUUID(),
    name,
    position,
    created_at: now,
    updated_at: now,
  }));
  const idByName = new Map(categories.map((category) => [category.name, category.id]));

  const positions = new Map<string | null, number>();
  const services = [...document.services]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ category, ...service }) => {
      const categoryId = idByName.get(category?.trim() ?? "") ?? null;
      const position = positions.get(categoryId) ?? 0;
      positions.set(categoryId, position + 1);
      return { ...service, category_id: categoryId, position };
    });

  return { ...document, version: BACKUP_VERSION, categories, services, settings };
}

function parseBackupDocument(input: unknown): ApiResult<BackupDocument> {
  const envelope = backupEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return apiFail(400, envelope.error.issues[0]?.message ?? "invalid backup file");
  }

  if (envelope.data.version === 1) {
    const parsed = backupDocumentV1Schema.safeParse(input);
    return parsed.success
      ? apiOk(upgradeV1Document(parsed.data))
      : apiFail(400, parsed.error.issues[0]?.message ?? "invalid backup file");
  }

  const parsed = backupDocumentV2Schema.safeParse(input);
  return parsed.success
    ? apiOk(parsed.data)
    : apiFail(400, parsed.error.issues[0]?.message ?? "invalid backup file");
}

/**
 * Replaces all categories, services, settings and icons with the backup's contents. A pre-import
 * snapshot is taken first, the database swap runs in one transaction, and the icons directory is
 * swapped only after the transaction commits.
 */
export function importBackup(input: unknown): ApiResult<ImportSummary> {
  const parsed = parseBackupDocument(input);
  if (!parsed.success) {
    return parsed;
  }

  const document = parsed.value;
  const db = getDb();
  const dataDir = getDataDir();
  const iconsDir = getIconsDir();
  const icons = decodeIcons(document);
  const categoryIds = new Set(document.categories.map((category) => category.id));

  const stagingDir = path.join(dataDir, `icons.import-${crypto.randomUUID()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    for (const [filename, buffer] of icons) {
      fs.writeFileSync(path.join(stagingDir, filename), buffer);
    }

    const snapshot = createSnapshot(db, dataDir, "pre-import");

    const insertCategory = db.prepare(
      "INSERT INTO categories (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const insertService = db.prepare(
      `INSERT INTO services (id, name, url, description, icon, icon_source_url, category_id, position, open_in_new_tab, created_at, updated_at,
                             check_enabled, check_method, check_target, check_interval, check_ignore_tls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");

    db.transaction(() => {
      db.exec("DELETE FROM services");
      db.exec("DELETE FROM service_trash");
      db.exec("DELETE FROM categories");
      db.exec("DELETE FROM settings");

      for (const category of document.categories) {
        insertCategory.run(
          category.id,
          category.name.trim(),
          category.position,
          category.created_at,
          category.updated_at
        );
      }

      for (const service of document.services) {
        const icon = service.icon && icons.has(service.icon) ? service.icon : null;
        const checkMethod = service.check_method ?? DEFAULT_CHECK_CONFIG.check_method;
        // The schema already rejected targets that don't suit their method; this normalizes.
        const checkTarget = normalizeCheckTarget(checkMethod, service.check_target);
        insertService.run(
          service.id,
          service.name,
          normalizeServiceUrl(service.url)!,
          service.description?.trim() || null,
          icon,
          icon ? (service.icon_source_url ?? null) : null,
          service.category_id && categoryIds.has(service.category_id) ? service.category_id : null,
          service.position,
          service.open_in_new_tab ? 1 : 0,
          service.created_at,
          service.updated_at,
          service.check_enabled ? 1 : 0,
          checkMethod,
          checkTarget.ok ? checkTarget.value : null,
          service.check_interval ?? DEFAULT_CHECK_CONFIG.check_interval,
          service.check_ignore_tls ? 1 : 0
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

    // Wallpapers are named by their content, so they are added next to any existing ones and
    // unused ones are left to the cleanup job.
    for (const wallpaper of document.wallpapers) {
      saveWallpaper(Buffer.from(wallpaper.data, "base64"));
    }

    return apiOk({
      icons: icons.size,
      services: document.services.length,
      snapshot: snapshot.name,
    });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
