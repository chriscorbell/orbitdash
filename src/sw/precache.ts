// Runs at build time (vite.config.ts), not in the browser.

const FONT = /\.woff2?$/;
// fontsource ships a file per script; the Latin ones cover the UI. Others are cached when used.
const LATIN_FONT = /-latin-(?!ext-)[^/]*\.woff2$/;

/**
 * What the service worker stores when it installs: the app shell (`/`, served as index.html) and
 * the build's assets, including the lazy dialogs and edit mode, so every part of the app opens
 * offline, not just the first screen.
 */
export function selectPrecacheUrls(fileNames: readonly string[]): string[] {
  const files = fileNames.filter(
    (name) =>
      name.startsWith("assets/") &&
      !name.endsWith(".map") &&
      (!FONT.test(name) || LATIN_FONT.test(name))
  );
  return ["/", ...files.map((name) => `/${name}`).sort()];
}
