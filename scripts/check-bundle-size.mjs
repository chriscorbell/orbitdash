import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const distAssetsDir = path.join(distDir, "assets");

const budgets = [
  { label: "entry js", prefix: "index-", extension: ".js", maxRawKb: 68, maxGzipKb: 23 },
  {
    label: "entry css",
    prefix: "index-",
    extension: ".css",
    maxRawKb: 90,
    maxGzipKb: 15,
  },
  {
    label: "react vendor",
    prefix: "react-vendor-",
    extension: ".js",
    maxRawKb: 230,
    maxGzipKb: 72,
  },
  { label: "vendor", prefix: "vendor-", extension: ".js", maxRawKb: 75, maxGzipKb: 23 },
  {
    label: "validation",
    prefix: "validation-",
    extension: ".js",
    maxRawKb: 22,
    maxGzipKb: 7,
  },
  {
    label: "service dialog",
    prefix: "ServiceDialog-",
    extension: ".js",
    maxRawKb: 100,
    maxGzipKb: 28,
  },
  {
    label: "settings dialog",
    prefix: "SettingsDialog-",
    extension: ".js",
    maxRawKb: 24,
    maxGzipKb: 8,
  },
  {
    label: "editable board",
    prefix: "EditableBoard-",
    extension: ".js",
    maxRawKb: 44,
    maxGzipKb: 14,
  },
  {
    label: "stats page",
    prefix: "StatsPage-",
    extension: ".js",
    maxRawKb: 74,
    maxGzipKb: 30,
  },
  {
    label: "command palette",
    prefix: "CommandPalette-",
    extension: ".js",
    maxRawKb: 10,
    maxGzipKb: 4,
  },
  {
    label: "import dialog",
    prefix: "ImportDialog-",
    extension: ".js",
    maxRawKb: 16,
    maxGzipKb: 6,
  },
  {
    label: "drag and drop",
    prefix: "drag-drop-",
    extension: ".js",
    maxRawKb: 48,
    maxGzipKb: 16,
  },
  {
    label: "service status",
    prefix: "ServiceStatus-",
    extension: ".js",
    maxRawKb: 10,
    maxGzipKb: 4,
  },
  {
    label: "sign-in screen",
    prefix: "SignInScreen-",
    extension: ".js",
    maxRawKb: 6,
    maxGzipKb: 3,
  },
  {
    label: "toaster",
    prefix: "toaster-",
    extension: ".js",
    maxRawKb: 16,
    maxGzipKb: 6,
  },
  // Not part of the page; the browser fetches it on its own and checks it for updates.
  { label: "service worker", file: "sw.js", maxRawKb: 8, maxGzipKb: 3 },
];

// Chunks that must only load on demand. If index.html references one, the
// entry imports it statically and its lazy() boundary has been defeated.
const lazyOnlyPrefixes = [
  "drag-drop-",
  "SettingsDialog-",
  "EditableBoard-",
  "StatsPage-",
  "CommandPalette-",
  "ImportDialog-",
  // Status dots and details, loaded by the first card with checks on.
  "ServiceStatus-",
  // Only shown when auth is on and this browser isn't signed in.
  "SignInScreen-",
  // Loads with the first toast, or once the page is idle.
  "toaster-",
  // Service worker setup, loaded after the page has.
  "pwa-",
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function findAsset({ file, prefix, extension }) {
  if (file) {
    const filePath = path.join(distDir, file);
    if (!existsSync(filePath)) {
      throw new Error(`Could not find built file ${file}`);
    }
    return filePath;
  }

  const files = readdirSync(distAssetsDir);
  const fileName = files.find((file) => file.startsWith(prefix) && file.endsWith(extension));

  if (!fileName) {
    throw new Error(`Could not find built asset for ${prefix}*${extension}`);
  }

  return path.join(distAssetsDir, fileName);
}

function measureAsset(assetPath) {
  const rawBytes = statSync(assetPath).size;
  const gzipBytes = gzipSync(readFileSync(assetPath)).byteLength;
  const brotliPath = `${assetPath}.br`;
  const brotliBytes = existsSync(brotliPath) ? statSync(brotliPath).size : null;

  return { rawBytes, gzipBytes, brotliBytes };
}

function findEagerLazyChunks() {
  const html = readFileSync(path.join(distDir, "index.html"), "utf8");
  const referencedAssets = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+)"/g)].map(
    (match) => match[1]
  );

  return referencedAssets.filter((asset) =>
    lazyOnlyPrefixes.some((prefix) => asset.startsWith(prefix))
  );
}

function main() {
  const failures = [];

  console.log("Bundle size report:");

  for (const budget of budgets) {
    const assetPath = findAsset(budget);
    const { rawBytes, gzipBytes, brotliBytes } = measureAsset(assetPath);
    const rawLimitBytes = budget.maxRawKb * 1024;
    const gzipLimitBytes = budget.maxGzipKb * 1024;
    const brotliLabel = brotliBytes === null ? "missing" : formatKb(brotliBytes);

    console.log(
      `- ${budget.label}: ${path.basename(assetPath)} raw ${formatKb(rawBytes)} / gzip ${formatKb(gzipBytes)} / br ${brotliLabel} (budget ${budget.maxRawKb} kB raw, ${budget.maxGzipKb} kB gzip)`
    );

    if (rawBytes > rawLimitBytes || gzipBytes > gzipLimitBytes) {
      failures.push(
        `${budget.label} exceeded budget: raw ${formatKb(rawBytes)} / gzip ${formatKb(gzipBytes)}`
      );
    }

    for (const extension of [".br", ".gz"]) {
      if (!existsSync(`${assetPath}${extension}`)) {
        failures.push(
          `${path.basename(assetPath)} has no precompressed ${extension} file; did the build run scripts/compress-assets.mjs?`
        );
      }
    }
  }

  for (const asset of findEagerLazyChunks()) {
    failures.push(
      `index.html loads ${asset} up front; it should only load through its lazy import`
    );
  }

  if (failures.length > 0) {
    console.error("\nBundle size budget failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nBundle size budgets passed.");
}

main();
