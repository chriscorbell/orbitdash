import fs from "fs";
import path from "path";
import { getDataDir } from "../db";
import { normalizeIconUrl } from "@shared/urls";

const ICONS_DIR_NAME = "icons";
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

export function getIconsDir(): string {
  const dir = path.join(getDataDir(), ICONS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function detectIconExt(buffer: Buffer): string | null {
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

function persistIcon(filename: string, buffer: Buffer): void {
  fs.writeFileSync(path.join(getIconsDir(), filename), buffer);
}

function validateUploadedIconBuffer(buffer: Buffer): string {
  const ext = detectIconExt(buffer);
  if (!ext) {
    throw new Error("unsupported icon type");
  }

  return ext;
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

function replaceStoredIcon(
  previousIcon: string | null | undefined,
  nextFilename: string,
  buffer: Buffer
): string {
  removeStoredIcon(previousIcon);
  persistIcon(nextFilename, buffer);
  return nextFilename;
}

export async function persistUploadedIcon(
  serviceId: string,
  iconFile: File,
  previousIcon?: string | null
): Promise<string> {
  if (iconFile.size > MAX_ICON_BYTES) {
    throw new Error("icon file is too large");
  }

  const buffer = Buffer.from(await iconFile.arrayBuffer());
  const ext = validateUploadedIconBuffer(buffer);
  return replaceStoredIcon(previousIcon, `${serviceId}${ext}`, buffer);
}

export async function persistDownloadedIcon(
  serviceId: string,
  iconUrl: string,
  previousIcon?: string | null
): Promise<string> {
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

    return replaceStoredIcon(previousIcon, `${serviceId}${ext}`, buffer);
  } finally {
    clearTimeout(timeout);
  }
}
