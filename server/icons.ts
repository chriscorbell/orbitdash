import fs from "node:fs";
import path from "node:path";
import { InputError } from "./board.ts";
import { normalizeIconUrl } from "./urls.ts";

export const MAX_ICON_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8000;

export const ICON_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/** The image type from a file's first bytes, as an extension, or null for anything else. */
export function detectIconExt(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  const head = buffer.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return ".gif";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return ".ico";

  return startsWithSvgTag(buffer.subarray(0, 512).toString("utf8")) ? ".svg" : null;
}

/**
 * Whether the text opens an `<svg>` element after an optional XML declaration, comments and
 * doctype. Skips each part with indexOf instead of one regex, which could backtrack
 * exponentially on a run of comments.
 */
function startsWithSvgTag(text: string): boolean {
  let rest = text.replace(/^\uFEFF/, "").trimStart();
  const skipPast = (end: string) => {
    const at = rest.indexOf(end);
    if (at < 0) return false;
    rest = rest.slice(at + end.length).trimStart();
    return true;
  };

  if (rest.startsWith("<?xml") && !skipPast("?>")) return false;
  for (;;) {
    if (rest.startsWith("<!--")) {
      rest = rest.slice(4);
      if (!skipPast("-->")) return false;
    } else if (/^<!DOCTYPE/i.test(rest)) {
      if (!skipPast(">")) return false;
    } else {
      return /^<svg[\s>]/i.test(rest);
    }
  }
}

export function createIconStore(dir: string) {
  fs.mkdirSync(dir, { recursive: true });

  /** Each icon gets a fresh name, so files never change under a URL and can be cached for good. */
  function write(linkId: string, buffer: Buffer): string {
    if (buffer.byteLength > MAX_ICON_BYTES) throw new InputError("That icon is larger than 2 MB.");
    const ext = detectIconExt(buffer);
    if (!ext) throw new InputError("Icons must be PNG, SVG, JPEG, GIF, WebP or ICO files.");
    const name = `${linkId}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    return name;
  }

  return {
    dir,

    /** Absolute path of a stored icon, or null if there's no such file. */
    resolve(name: string): string | null {
      const file = path.join(dir, path.basename(name));
      return fs.existsSync(file) ? file : null;
    },

    async saveUpload(linkId: string, file: File): Promise<string> {
      if (file.size > MAX_ICON_BYTES) throw new InputError("That icon is larger than 2 MB.");
      return write(linkId, Buffer.from(await file.arrayBuffer()));
    },

    /** Downloads an icon. Any host is allowed: icons served on the LAN are the common case. */
    async saveFromUrl(
      linkId: string,
      url: string,
      fetchIcon: typeof fetch = fetch
    ): Promise<string> {
      const normalized = normalizeIconUrl(url);
      if (!normalized) throw new InputError("The icon URL must start with http:// or https://.");
      let response: Response;
      try {
        response = await fetchIcon(normalized, {
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
      } catch {
        throw new InputError("The icon couldn't be downloaded.");
      }
      if (!response.ok)
        throw new InputError(`The icon couldn't be downloaded (${response.status}).`);
      if (Number(response.headers.get("content-length") ?? 0) > MAX_ICON_BYTES) {
        throw new InputError("That icon is larger than 2 MB.");
      }
      return write(linkId, Buffer.from(await response.arrayBuffer()));
    },

    remove(name: string | null): void {
      if (name) fs.rmSync(path.join(dir, path.basename(name)), { force: true });
    },

    /** Deletes files no link points at, such as icons left by a crash mid-save. */
    removeUnused(inUse: Set<string>): number {
      let removed = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && !inUse.has(entry.name)) {
          fs.rmSync(path.join(dir, entry.name));
          removed += 1;
        }
      }
      return removed;
    },
  };
}

export type IconStore = ReturnType<typeof createIconStore>;
