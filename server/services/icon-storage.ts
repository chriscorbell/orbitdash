import fs from "fs";
import path from "path";
import { getDataDir, getDb } from "../db";
import { normalizeIconUrl } from "@shared/urls";

const ICONS_DIR_NAME = "icons";
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

export function getIconsDir(): string {
  const dir = path.join(getDataDir(), ICONS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function detectIconExt(buffer: Buffer): string | null {
  if (
    buffer.byteLength >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  ) {
    return ".png";
  }

  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return ".gif";
  }

  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  if (
    buffer.byteLength >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return ".ico";
  }

  const headerText = buffer.subarray(0, 512).toString("utf-8").trimStart();
  const normalizedHeaderText = headerText.startsWith("\uFEFF") ? headerText.slice(1) : headerText;
  if (/^(<\?xml[\s\S]*?)?<svg[\s>]/i.test(normalizedHeaderText)) {
    return ".svg";
  }

  return null;
}

/** Each write gets a fresh name so a failed save can drop it without touching the current icon. */
function persistIcon(serviceId: string, ext: string, buffer: Buffer): string {
  const filename = `${serviceId}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  fs.writeFileSync(path.join(getIconsDir(), filename), buffer);
  return filename;
}

function validateUploadedIconBuffer(buffer: Buffer): string {
  const ext = detectIconExt(buffer);
  if (!ext) {
    throw new Error("unsupported icon type");
  }

  return ext;
}

export function copyStoredIcon(
  iconFilename: string | null | undefined,
  newServiceId: string
): string | null {
  if (!iconFilename) {
    return null;
  }

  const sourcePath = path.join(getIconsDir(), iconFilename);
  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  const newFilename = `${newServiceId}${path.extname(iconFilename)}`;
  fs.copyFileSync(sourcePath, path.join(getIconsDir(), newFilename));
  return newFilename;
}

export function removeStoredIcon(iconFilename: string | null | undefined): void {
  if (!iconFilename) {
    return;
  }

  const iconPath = path.join(getIconsDir(), iconFilename);
  if (fs.existsSync(iconPath)) {
    fs.unlinkSync(iconPath);
  }
}

/**
 * Icon filenames still in use: by live services, and by services waiting in the trash (so undoing a
 * delete brings the icon back).
 */
export function listReferencedIcons(): Set<string> {
  const db = getDb();
  const live = db.prepare("SELECT icon FROM services WHERE icon IS NOT NULL").all() as Array<{
    icon: string;
  }>;
  const trashed = db
    .prepare(
      `SELECT json_extract(data, '$.icon') AS icon FROM service_trash
       WHERE json_extract(data, '$.icon') IS NOT NULL`
    )
    .all() as Array<{ icon: string }>;
  return new Set([...live, ...trashed].map((row) => row.icon));
}

/**
 * Deletes files in the icons directory that no service references, such as icons left behind by a
 * crash between writing the file and saving the service. Returns the number of files removed.
 */
export function cleanupOrphanIcons(): number {
  const referenced = listReferencedIcons();

  const iconsDir = getIconsDir();
  let removed = 0;
  for (const entry of fs.readdirSync(iconsDir, { withFileTypes: true })) {
    if (!entry.isFile() || referenced.has(entry.name)) {
      continue;
    }

    fs.unlinkSync(path.join(iconsDir, entry.name));
    removed += 1;
  }

  return removed;
}

/** Writes an uploaded icon under a new filename. The caller removes the previous icon. */
export async function persistUploadedIcon(serviceId: string, iconFile: File): Promise<string> {
  if (iconFile.size > MAX_ICON_BYTES) {
    throw new Error("icon file is too large");
  }

  const buffer = Buffer.from(await iconFile.arrayBuffer());
  const ext = validateUploadedIconBuffer(buffer);
  return persistIcon(serviceId, ext, buffer);
}

/** Downloads an icon and writes it under a new filename. The caller removes the previous icon. */
export async function persistDownloadedIcon(serviceId: string, iconUrl: string): Promise<string> {
  const normalizedIconUrl = normalizeIconUrl(iconUrl);
  if (!normalizedIconUrl) {
    throw new Error("Icon URL must be a valid http(s) URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    // fetch follows redirects natively (capped by the runtime); intentionally no
    // host restrictions here — LAN-hosted icons are a primary home-lab use case.
    const response = await fetch(normalizedIconUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("Failed to download icon");
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > MAX_ICON_BYTES) {
      throw new Error("Icon file is too large");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_ICON_BYTES) {
      throw new Error("Icon file is too large");
    }

    const ext = detectIconExt(buffer);
    if (!ext) {
      throw new Error("Unsupported icon type");
    }

    return persistIcon(serviceId, ext, buffer);
  } finally {
    clearTimeout(timeout);
  }
}
