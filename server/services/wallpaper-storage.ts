import crypto from "crypto";
import fs from "fs";
import path from "path";
import { referencedWallpapers, WALLPAPER_FILENAME_PATTERN } from "@shared/dashboard-settings";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDataDir, getDb } from "../db";
import { detectIconExt } from "./icon-storage";

const WALLPAPERS_DIR_NAME = "wallpapers";
export const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;
/** Uploads stay this long before cleanup may remove them, so a save can still point at them. */
const UNUSED_GRACE_MS = 60 * 60 * 1000;

const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".gif", ".webp"]);

export const WALLPAPER_MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function getWallpapersDir(): string {
  const dir = path.join(getDataDir(), WALLPAPERS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The file extension for a supported raster image, read from its bytes; SVG and ICO are refused. */
export function detectWallpaperExt(buffer: Buffer): string | null {
  // AVIF: an ISO-BMFF `ftyp` box whose brand is avif/avis.
  if (buffer.byteLength >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    return brand === "avif" || brand === "avis" ? ".avif" : null;
  }
  const ext = detectIconExt(buffer);
  return ext && RASTER_EXTENSIONS.has(ext) ? ext : null;
}

/** Stores an uploaded image under a name derived from its content, so re-uploads are free. */
export function saveWallpaper(buffer: Buffer): ApiResult<{ filename: string }> {
  if (buffer.byteLength === 0) {
    return apiFail(400, "the image is empty");
  }
  if (buffer.byteLength > MAX_WALLPAPER_BYTES) {
    return apiFail(413, "wallpapers must be 10 MB or smaller");
  }
  const ext = detectWallpaperExt(buffer);
  if (!ext) {
    return apiFail(400, "wallpapers must be PNG, JPEG, GIF, WebP or AVIF images");
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const filename = `wallpaper-${hash}${ext}`;
  const target = path.join(getWallpapersDir(), filename);
  if (fs.existsSync(target)) {
    // Touch it so cleanup counts the grace period from this upload.
    const now = new Date();
    fs.utimesSync(target, now, now);
  } else {
    fs.writeFileSync(target, buffer);
  }
  return apiOk({ filename });
}

export function wallpaperPath(filename: string): string | null {
  return WALLPAPER_FILENAME_PATTERN.test(filename) ? path.join(getWallpapersDir(), filename) : null;
}

/** Wallpapers that shared settings or any device's overrides point at. */
export function listReferencedWallpapers(): Set<string> {
  const rows = getDb()
    .prepare("SELECT value FROM settings WHERE key = ? OR key LIKE ?")
    .all("dashboard.settings", "dashboard.device.%") as Array<{ value: string }>;
  const documents = rows.map((row) => {
    try {
      return JSON.parse(row.value) as unknown;
    } catch {
      return null;
    }
  });
  return referencedWallpapers(documents);
}

/** Deletes wallpapers nothing points at once they are past the upload grace period. */
export function purgeUnusedWallpapers(now: number = Date.now()): number {
  const dir = getWallpapersDir();
  const referenced = listReferencedWallpapers();
  let removed = 0;
  for (const filename of fs.readdirSync(dir)) {
    if (referenced.has(filename)) continue;
    const filePath = path.join(dir, filename);
    const stats = fs.statSync(filePath);
    if (stats.isFile() && now - stats.mtimeMs > UNUSED_GRACE_MS) {
      fs.rmSync(filePath, { force: true });
      removed += 1;
    }
  }
  return removed;
}
