import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const distAssetsDir = path.resolve(process.cwd(), "dist/assets");

const budgets = [
  { label: "entry js", prefix: "index-", extension: ".js", maxRawKb: 145, maxGzipKb: 45 },
  {
    label: "entry css",
    prefix: "index-",
    extension: ".css",
    maxRawKb: 70,
    maxGzipKb: 12,
  },
  {
    label: "react vendor",
    prefix: "react-vendor-",
    extension: ".js",
    maxRawKb: 230,
    maxGzipKb: 75,
  },
  { label: "charts", prefix: "charts-", extension: ".js", maxRawKb: 180, maxGzipKb: 65 },
  {
    label: "validation",
    prefix: "validation-",
    extension: ".js",
    maxRawKb: 65,
    maxGzipKb: 17,
  },
  {
    label: "service dialog",
    prefix: "ServiceDialog-",
    extension: ".js",
    maxRawKb: 100,
    maxGzipKb: 28,
  },
  {
    label: "drag and drop",
    prefix: "drag-drop-",
    extension: ".js",
    maxRawKb: 55,
    maxGzipKb: 18,
  },
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function findAsset(prefix, extension) {
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

  return { rawBytes, gzipBytes };
}

function main() {
  const failures = [];

  console.log("Bundle size report:");

  for (const budget of budgets) {
    const assetPath = findAsset(budget.prefix, budget.extension);
    const { rawBytes, gzipBytes } = measureAsset(assetPath);
    const rawLimitBytes = budget.maxRawKb * 1024;
    const gzipLimitBytes = budget.maxGzipKb * 1024;

    console.log(
      `- ${budget.label}: ${path.basename(assetPath)} raw ${formatKb(rawBytes)} / gzip ${formatKb(gzipBytes)} (budget ${budget.maxRawKb} kB raw, ${budget.maxGzipKb} kB gzip)`
    );

    if (rawBytes > rawLimitBytes || gzipBytes > gzipLimitBytes) {
      failures.push(
        `${budget.label} exceeded budget: raw ${formatKb(rawBytes)} / gzip ${formatKb(gzipBytes)}`
      );
    }
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
