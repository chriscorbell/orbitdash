import dns from "dns/promises";
import fs from "fs";
import net from "net";
import path from "path";
import { getDataDir } from "../db";
import { normalizeIconUrl } from "@shared/urls";

const ICONS_DIR_NAME = "icons";
export const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_ICON_REDIRECTS = 3;

export function getIconsDir(): string {
  const dir = path.join(getDataDir(), ICONS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const blockedRanges = new net.BlockList();
blockedRanges.addSubnet("0.0.0.0", 8);
blockedRanges.addSubnet("10.0.0.0", 8);
blockedRanges.addSubnet("100.64.0.0", 10);
blockedRanges.addSubnet("127.0.0.0", 8);
blockedRanges.addSubnet("169.254.0.0", 16);
blockedRanges.addSubnet("172.16.0.0", 12);
blockedRanges.addSubnet("192.168.0.0", 16);
blockedRanges.addSubnet("::1", 128, "ipv6");
blockedRanges.addSubnet("fc00::", 7, "ipv6");
blockedRanges.addSubnet("fe80::", 10, "ipv6");

function isBlockedAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 0) {
    return true;
  }

  return blockedRanges.check(address, ipVersion === 6 ? "ipv6" : "ipv4");
}

async function isBlockedRemoteHost(hostname: string): Promise<boolean> {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  // WHATWG URLs keep brackets around IPv6 hostnames
  const bareHost = normalized.replace(/^\[|\]$/g, "");
  if (net.isIP(bareHost)) {
    return isBlockedAddress(bareHost);
  }

  // ponytail: lookup-then-fetch leaves a DNS-rebinding window; pin the resolved IP if that ever matters
  try {
    const { address } = await dns.lookup(bareHost);
    return isBlockedAddress(address);
  } catch {
    return true;
  }
}

async function assertSafeRemoteIconUrl(iconUrl: string): Promise<URL> {
  const parsed = new URL(iconUrl);
  if (await isBlockedRemoteHost(parsed.hostname)) {
    throw new Error("Remote icon host is not allowed");
  }

  return parsed;
}

async function fetchIconResponse(iconUrl: string, signal: AbortSignal): Promise<Response> {
  let currentUrl = (await assertSafeRemoteIconUrl(iconUrl)).toString();

  for (let redirectCount = 0; redirectCount <= MAX_ICON_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal,
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    if (redirectCount === MAX_ICON_REDIRECTS) {
      throw new Error("Too many redirects while downloading icon");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Failed to download icon");
    }

    currentUrl = (
      await assertSafeRemoteIconUrl(new URL(location, currentUrl).toString())
    ).toString();
  }

  throw new Error("Failed to download icon");
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

  await assertSafeRemoteIconUrl(normalizedIconUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetchIconResponse(normalizedIconUrl, controller.signal);
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
