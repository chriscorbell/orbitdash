// Renders the app icons in public/icons from the mark in public/orbitdash.svg, using the Chromium
// that Playwright already installs for the e2e tests (npm run test:e2e:install).
// Run it after changing the mark or the colors: node scripts/generate-pwa-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const outDir = path.join(repoRoot, "public", "icons");

// The dark theme's card surface (oklch(0.195 0.009 255)) and the ice accent.
const BACKGROUND = "#121519";
const MARK_COLOR = "#49a9df";
// The mark's bounds, slightly wider than the source viewBox so nothing gets clipped.
const MARK_VIEW_BOX = { x: -0.1, y: 0, width: 18.1, height: 20 };

// `radius` rounds the corners (as a share of the size); `mark` is the mark's height as a share
// of the size. Maskable icons fill the canvas and keep the mark well inside the 80% safe zone,
// since launchers crop them to circles, squircles and so on. iOS rounds the corners itself.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: 0.225, mark: 0.56 },
  { file: "icon-512.png", size: 512, radius: 0.225, mark: 0.56 },
  { file: "icon-maskable-512.png", size: 512, radius: 0, mark: 0.44 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, mark: 0.54 },
];

function readMarkShapes() {
  const source = readFileSync(path.join(repoRoot, "public", "orbitdash.svg"), "utf8");
  const shapes = [...source.matchAll(/<(?:circle|path)\b[^>]*\/>/g)].map((match) =>
    match[0].replace(/\s+class="[^"]*"/, "")
  );
  if (shapes.length === 0) {
    throw new Error("public/orbitdash.svg has no <circle> or <path> elements to draw");
  }
  return shapes.join("");
}

function iconSvg({ size, radius, mark }, shapes) {
  const height = size * mark;
  const width = (height * MARK_VIEW_BOX.width) / MARK_VIEW_BOX.height;
  const { x, y, width: vbWidth, height: vbHeight } = MARK_VIEW_BOX;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BACKGROUND}"/>
  <svg x="${(size - width) / 2}" y="${(size - height) / 2}" width="${width}" height="${height}" viewBox="${x} ${y} ${vbWidth} ${vbHeight}" fill="${MARK_COLOR}">${shapes}</svg>
</svg>`;
}

async function main() {
  const shapes = readMarkShapes();
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const icon of ICONS) {
      await page.setViewportSize({ width: icon.size, height: icon.size });
      await page.setContent(
        `<!doctype html><body style="margin:0;background:transparent">${iconSvg(icon, shapes)}</body>`
      );
      const png = await page.screenshot({
        clip: { x: 0, y: 0, width: icon.size, height: icon.size },
        omitBackground: true,
      });
      writeFileSync(path.join(outDir, icon.file), png);
      console.log(`Wrote public/icons/${icon.file} (${icon.size}x${icon.size})`);
    }
  } finally {
    await browser.close();
  }
}

await main();
