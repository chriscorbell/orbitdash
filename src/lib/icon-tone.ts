/**
 * Icon tone: whether an icon would vanish on the dark page. A plain dark glyph ("dark") is drawn
 * in reverse; a colored logo with large dark parts ("mixed") gets a faint outline instead, so its
 * colors stay true.
 */
export type IconTone = "dark" | "mixed" | "light" | "normal";

// Bumped when the classification changes, so old verdicts aren't reused.
const CACHE_KEY = "orbitdash.iconTones.v2";
const CACHE_LIMIT = 300;

const memoryCache = new Map<string, IconTone>();
const pending = new Map<string, Promise<IconTone>>();
let storageLoaded = false;

function isTone(value: unknown): value is IconTone {
  return value === "dark" || value === "mixed" || value === "light" || value === "normal";
}

function loadStoredTones() {
  if (storageLoaded) return;
  storageLoaded = true;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
    if (typeof stored !== "object" || stored === null) return;
    for (const [src, tone] of Object.entries(stored)) {
      if (isTone(tone)) memoryCache.set(src, tone);
    }
  } catch {
    // A broken cache only costs a re-measure.
  }
}

function storeTones() {
  try {
    // Keep the newest entries; icon URLs change when an icon is replaced.
    const entries = [...memoryCache.entries()].slice(-CACHE_LIMIT);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage access issues.
  }
}

/** The tone already known for an icon, if any, so a card can render its plate on first paint. */
export function getCachedIconTone(src: string): IconTone | undefined {
  loadStoredTones();
  return memoryCache.get(src);
}

/** Measures an icon once per URL; anything unreadable (no CORS, broken image) counts as normal. */
export function measureIconTone(src: string): Promise<IconTone> {
  const cached = getCachedIconTone(src);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  // The pixel analysis runs after first paint, so it loads then.
  const measured = Promise.all([
    import("./icon-tone-analysis.ts"),
    new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      // Library icons come from a CDN that allows CORS; without this the canvas can't be read.
      if (new URL(src, location.href).origin !== location.origin) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    }),
  ])
    .then(([{ analyzeImage }, image]): IconTone => (image ? analyzeImage(image) : "normal"))
    .catch((): IconTone => "normal")
    .then((tone) => {
      pending.delete(src);
      memoryCache.set(src, tone);
      storeTones();
      return tone;
    });

  pending.set(src, measured);
  return measured;
}

export function resetIconTonesForTesting() {
  memoryCache.clear();
  pending.clear();
  storageLoaded = false;
}
