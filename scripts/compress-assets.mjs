// Writes .br and .gz siblings next to compressible build output so the server
// can send precompressed files without compressing on every request.
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), process.argv[2] ?? "dist");
const compressibleExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);
// Below this size a response fits in one packet either way.
const minBytes = 512;

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function compress(source) {
  return {
    br: brotliCompressSync(source, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength,
      },
    }),
    gz: gzipSync(source, { level: constants.Z_BEST_COMPRESSION }),
  };
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function main() {
  const totals = { files: 0, raw: 0, br: 0, gz: 0 };

  for (const filePath of listFiles(distDir)) {
    if (!compressibleExtensions.has(path.extname(filePath))) {
      continue;
    }

    const source = readFileSync(filePath);
    if (source.byteLength < minBytes) {
      continue;
    }

    const compressed = compress(source);
    totals.files += 1;
    totals.raw += source.byteLength;

    for (const [extension, output] of Object.entries(compressed)) {
      // Only keep a variant that actually saves bytes.
      const keep = output.byteLength < source.byteLength;
      if (keep) {
        writeFileSync(`${filePath}.${extension}`, output);
      }
      totals[extension] += keep ? output.byteLength : source.byteLength;
    }
  }

  console.log(
    `Precompressed ${totals.files} files in ${path.relative(process.cwd(), distDir) || "."}: ` +
      `${formatKb(totals.raw)} raw, ${formatKb(totals.br)} brotli, ${formatKb(totals.gz)} gzip`
  );
}

main();
