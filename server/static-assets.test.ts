import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { gzipSync, brotliCompressSync } from "zlib";
import { Hono } from "hono";
import {
  createStaticAssetHandler,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
} from "./static-assets";

const INDEX_HTML = `<!doctype html><html><head><title>orbitdash</title></head><body>${"<div></div>".repeat(80)}</body></html>`;
const ENTRY_JS = `export const answer = ${JSON.stringify("x".repeat(2000))};`;
const ENTRY_PATH = "/assets/index-AbC_12-z.js";
const FONT_PATH = "/assets/inter-latin-Dx4kXJAl.woff2";

let distDir: string;
let app: Hono;

function writeDistFile(urlPath: string, contents: string | Uint8Array, variants = true) {
  const filePath = path.join(distDir, urlPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);

  if (variants) {
    fs.writeFileSync(`${filePath}.br`, brotliCompressSync(contents));
    fs.writeFileSync(`${filePath}.gz`, gzipSync(contents));
  }
}

function readDistFile(relativePath: string) {
  return new Uint8Array(fs.readFileSync(path.join(distDir, relativePath)));
}

function get(urlPath: string, headers: Record<string, string> = {}) {
  return app.request(urlPath, { headers });
}

async function bodyBytes(response: Response) {
  return new Uint8Array(await response.arrayBuffer());
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-static-"));
  writeDistFile("/index.html", INDEX_HTML);
  writeDistFile(ENTRY_PATH, ENTRY_JS);
  writeDistFile(FONT_PATH, new Uint8Array([0x77, 0x4f, 0x46, 0x32]), false);
  writeDistFile("/orbitdash.svg", `<svg xmlns="http://www.w3.org/2000/svg"></svg>`, false);
  // A stray compressed file without an original is served as a file of its own.
  writeDistFile("/backup.gz", new Uint8Array([0x1f, 0x8b]), false);

  app = new Hono();
  app.get("*", createStaticAssetHandler(distDir));
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

describe("static assets: content encoding", () => {
  it("prefers brotli when the browser accepts it", async () => {
    const response = await get(ENTRY_PATH, { "Accept-Encoding": "gzip, deflate, br, zstd" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("content-type")).toBe("text/javascript;charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(await bodyBytes(response)).toEqual(readDistFile(`${ENTRY_PATH}.br`));
  });

  it("falls back to gzip when brotli is not accepted", async () => {
    const response = await get(ENTRY_PATH, { "Accept-Encoding": "gzip, deflate" });

    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(await bodyBytes(response)).toEqual(readDistFile(`${ENTRY_PATH}.gz`));
  });

  it("honors q-values, including q=0 exclusions and wildcards", async () => {
    const cases: [string, string | null][] = [
      ["br;q=0, gzip", "gzip"],
      ["gzip;q=1.0, br;q=0.5", "gzip"],
      ["gzip;q=0.5, br;q=0.8", "br"],
      ["*", "br"],
      ["br;q=0, *;q=0.1", "gzip"],
      ["br;q=0, gzip;q=0", null],
      ["identity", null],
      ["GZIP", "gzip"],
      ["br;q=abc, gzip", "gzip"],
      [" , gzip ; q=0.9 ", "gzip"],
    ];

    for (const [acceptEncoding, expected] of cases) {
      const response = await get(ENTRY_PATH, { "Accept-Encoding": acceptEncoding });
      expect([acceptEncoding, response.headers.get("content-encoding")]).toEqual([
        acceptEncoding,
        expected,
      ]);
    }
  });

  it("sends the uncompressed file without Accept-Encoding, still marked as varying", async () => {
    const response = await get(ENTRY_PATH);

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(await response.text()).toBe(ENTRY_JS);
  });

  it("serves files without precompressed variants as-is and without Vary", async () => {
    const response = await get(FONT_PATH, { "Accept-Encoding": "br, gzip" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(await bodyBytes(response)).toEqual(readDistFile(FONT_PATH));
  });

  it("serves a compressed file that has no original as a plain file", async () => {
    const response = await get("/backup.gz", { "Accept-Encoding": "gzip" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
  });
});

describe("static assets: caching", () => {
  it("caches hashed build assets for a year as immutable", async () => {
    const entry = await get(ENTRY_PATH);
    const font = await get(FONT_PATH);

    expect(entry.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(font.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it("makes index.html and unhashed files revalidate with an ETag", async () => {
    for (const urlPath of ["/", "/index.html", "/orbitdash.svg"]) {
      const response = await get(urlPath);

      expect(response.headers.get("cache-control")).toBe(REVALIDATE_CACHE_CONTROL);
      expect(response.headers.get("etag")).toMatch(/^"[\w-]+"$/);
    }
  });

  it("gives each encoding its own ETag", async () => {
    const identity = await get("/");
    const brotli = await get("/", { "Accept-Encoding": "br" });
    const gzip = await get("/", { "Accept-Encoding": "gzip" });
    const etags = new Set([identity, brotli, gzip].map((r) => r.headers.get("etag")));

    expect(etags.size).toBe(3);
  });

  it("answers a matching If-None-Match with 304 and no body", async () => {
    const first = await get("/", { "Accept-Encoding": "br" });
    const etag = first.headers.get("etag") ?? "";

    const response = await get("/", { "Accept-Encoding": "br", "If-None-Match": etag });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe(etag);
    expect(response.headers.get("cache-control")).toBe(REVALIDATE_CACHE_CONTROL);
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(response.headers.get("content-encoding")).toBeNull();
  });

  it("matches weak, listed, and wildcard If-None-Match values", async () => {
    const etag = (await get("/orbitdash.svg")).headers.get("etag") ?? "";

    for (const ifNoneMatch of [`W/${etag}`, `"other", ${etag}`, "*"]) {
      const response = await get("/orbitdash.svg", { "If-None-Match": ifNoneMatch });
      expect(response.status).toBe(304);
    }
  });

  it("sends the full response when the ETag is stale or for another encoding", async () => {
    const gzipEtag = (await get("/", { "Accept-Encoding": "gzip" })).headers.get("etag") ?? "";

    const stale = await get("/", { "If-None-Match": '"stale"' });
    const otherEncoding = await get("/", { "Accept-Encoding": "br", "If-None-Match": gzipEtag });

    expect(stale.status).toBe(200);
    expect(otherEncoding.status).toBe(200);
    expect(otherEncoding.headers.get("content-encoding")).toBe("br");
  });

  it("revalidates the SPA fallback against index.html's ETag", async () => {
    const etag = (await get("/")).headers.get("etag") ?? "";

    const response = await get("/settings/layout", { "If-None-Match": etag });

    expect(response.status).toBe(304);
  });
});

describe("static assets: routing", () => {
  it("falls back to index.html for unknown non-API routes", async () => {
    const response = await get("/some/client/route", { "Accept-Encoding": "gzip" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html;charset=utf-8");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("cache-control")).toBe(REVALIDATE_CACHE_CONTROL);
    expect(await bodyBytes(response)).toEqual(readDistFile("/index.html.gz"));
  });

  it("keeps returning JSON 404s for unknown API routes", async () => {
    const response = await get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("returns 404 instead of HTML for missing build assets", async () => {
    const response = await get("/assets/index-Missing1.js");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain("text/html");
  });

  it("serves index.html from memory, not from disk on each request", async () => {
    const indexPath = path.join(distDir, "index.html");
    fs.writeFileSync(indexPath, "<!doctype html><title>changed on disk</title>");

    try {
      expect(await (await get("/")).text()).toBe(INDEX_HTML);
      expect(await (await get("/another/route")).text()).toBe(INDEX_HTML);
    } finally {
      fs.writeFileSync(indexPath, INDEX_HTML);
    }
  });

  it("answers HEAD requests with headers and no body", async () => {
    const response = await app.request(ENTRY_PATH, {
      method: "HEAD",
      headers: { "Accept-Encoding": "br" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(await response.text()).toBe("");
  });

  it("returns 404 for unknown routes when the build has no index.html", async () => {
    const emptyDist = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-static-empty-"));
    const emptyApp = new Hono();
    emptyApp.get("*", createStaticAssetHandler(emptyDist));

    try {
      const response = await emptyApp.request("/");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    } finally {
      fs.rmSync(emptyDist, { recursive: true, force: true });
    }
  });
});
