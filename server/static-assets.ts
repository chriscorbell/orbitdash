import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { Context, Handler } from "hono";
import { jsonNotFound } from "./api-response";

type ContentEncoding = "br" | "gzip";

interface AssetVariant {
  /** In-memory body; variants without one are streamed from disk. */
  body: Uint8Array | null;
  encoding: ContentEncoding | null;
  etag: string;
  filePath: string;
  size: number;
}

interface StaticAsset {
  cacheControl: string;
  contentType: string;
  /** Identity first, then precompressed variants in preference order. */
  variants: AssetVariant[];
}

// Preference order when the client accepts several encodings equally.
const PRECOMPRESSED_VARIANTS: { encoding: ContentEncoding; extension: string }[] = [
  { encoding: "br", extension: ".br" },
  { encoding: "gzip", extension: ".gz" },
];
const PRECOMPRESSED_EXTENSIONS = new Set(PRECOMPRESSED_VARIANTS.map((v) => v.extension));

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_CACHE_CONTROL = "no-cache";

// Vite writes build output as /assets/[name]-[hash].[ext] with an 8-character hash.
const HASHED_ASSET_PATTERN = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("base64url").slice(0, 27);
}

function toUrlPath(distDir: string, filePath: string): string {
  return `/${path.relative(distDir, filePath).split(path.sep).join("/")}`;
}

function loadAsset(distDir: string, filePath: string): StaticAsset {
  const urlPath = toUrlPath(distDir, filePath);
  const contentHash = hashFile(filePath);
  const variants: AssetVariant[] = [
    {
      body: null,
      encoding: null,
      etag: `"${contentHash}"`,
      filePath,
      size: fs.statSync(filePath).size,
    },
  ];

  for (const { encoding, extension } of PRECOMPRESSED_VARIANTS) {
    const variantPath = `${filePath}${extension}`;
    if (fs.existsSync(variantPath)) {
      // Each representation needs its own ETag; the suffix keeps them distinct.
      variants.push({
        body: null,
        encoding,
        etag: `"${contentHash}-${encoding}"`,
        filePath: variantPath,
        size: fs.statSync(variantPath).size,
      });
    }
  }

  return {
    cacheControl: HASHED_ASSET_PATTERN.test(urlPath)
      ? IMMUTABLE_CACHE_CONTROL
      : REVALIDATE_CACHE_CONTROL,
    contentType: Bun.file(filePath).type,
    variants,
  };
}

function loadAssets(distDir: string): Map<string, StaticAsset> {
  const files = listFiles(distDir);
  const fileSet = new Set(files);
  const assets = new Map<string, StaticAsset>();

  for (const filePath of files) {
    const extension = path.extname(filePath);
    const isVariant =
      PRECOMPRESSED_EXTENSIONS.has(extension) && fileSet.has(filePath.slice(0, -extension.length));
    if (!isVariant) {
      assets.set(toUrlPath(distDir, filePath), loadAsset(distDir, filePath));
    }
  }

  return assets;
}

function parseAcceptEncoding(header: string | undefined): Map<string, number> {
  const weights = new Map<string, number>();

  for (const part of (header ?? "").split(",")) {
    const [name = "", ...params] = part.split(";").map((token) => token.trim());
    if (!name) {
      continue;
    }

    let weight = 1;
    for (const param of params) {
      const [key, value] = param.split("=").map((token) => token.trim());
      if (key?.toLowerCase() === "q") {
        const parsed = Number(value);
        weight = Number.isFinite(parsed) ? parsed : 0;
      }
    }

    weights.set(name.toLowerCase(), weight);
  }

  return weights;
}

function selectVariant(asset: StaticAsset, acceptEncoding: string | undefined): AssetVariant {
  const weights = parseAcceptEncoding(acceptEncoding);
  const [identity] = asset.variants;
  let selected = identity;
  let selectedWeight = 0;

  for (const variant of asset.variants) {
    if (!variant.encoding) {
      continue;
    }

    const weight = weights.get(variant.encoding) ?? weights.get("*") ?? 0;
    if (weight > selectedWeight) {
      selected = variant;
      selectedWeight = weight;
    }
  }

  return selected;
}

// If-None-Match uses weak comparison (RFC 9110 §13.1.2).
function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false;
  }

  const stripWeak = (tag: string) => tag.trim().replace(/^W\//, "");
  const target = stripWeak(etag);

  return header.split(",").some((tag) => tag.trim() === "*" || stripWeak(tag) === target);
}

function respondWithAsset(c: Context, asset: StaticAsset): Response {
  const variant = selectVariant(asset, c.req.header("accept-encoding"));
  const headers = new Headers({
    "Cache-Control": asset.cacheControl,
    ETag: variant.etag,
  });

  if (asset.variants.length > 1) {
    headers.set("Vary", "Accept-Encoding");
  }

  if (matchesIfNoneMatch(c.req.header("if-none-match"), variant.etag)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("Content-Type", asset.contentType);
  // Explicit so HEAD responses, which Hono sends without a body, report it too.
  headers.set("Content-Length", String(variant.size));
  if (variant.encoding) {
    headers.set("Content-Encoding", variant.encoding);
  }

  return new Response(variant.body ?? Bun.file(variant.filePath), { headers });
}

/**
 * Serves the built frontend from `distDir`: precompressed variants chosen by
 * Accept-Encoding, long-lived caching for hashed assets, ETag revalidation for
 * everything else, and index.html (held in memory) as the SPA fallback.
 *
 * The directory is scanned once, so only files present at startup are served.
 */
export function createStaticAssetHandler(distDir: string): Handler {
  const assets = loadAssets(distDir);
  const indexAsset = assets.get("/index.html");

  if (indexAsset) {
    for (const variant of indexAsset.variants) {
      variant.body = fs.readFileSync(variant.filePath);
    }
  }

  return (c) => {
    const requestPath = c.req.path;

    if (requestPath.startsWith("/api/")) {
      return jsonNotFound(c);
    }

    const asset = assets.get(requestPath === "/" ? "/index.html" : requestPath);
    if (asset) {
      return respondWithAsset(c, asset);
    }

    // A missing chunk must not come back as HTML: the browser would report a
    // MIME type error instead of a failed request.
    if (requestPath.startsWith("/assets/") || !indexAsset) {
      return c.text("Not found", 404);
    }

    return respondWithAsset(c, indexAsset);
  };
}
