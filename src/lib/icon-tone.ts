/**
 * Icon tone: whether an icon is mostly very dark or very light. A dark glyph disappears on the dark
 * theme (and a white one on the light theme), so cards put those icons on a contrasting plate.
 */
export type IconTone = "dark" | "light" | "normal";

const CACHE_KEY = "orbitdash.iconTones";
const CACHE_LIMIT = 300;

const memoryCache = new Map<string, IconTone>();
const pending = new Map<string, Promise<IconTone>>();
let storageLoaded = false;

function isTone(value: unknown): value is IconTone {
  return value === "dark" || value === "light" || value === "normal";
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

/** Measures an icon once per URL; same-origin icons only, anything unreadable counts as normal. */
export function measureIconTone(src: string): Promise<IconTone> {
  const cached = getCachedIconTone(src);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  // The pixel analysis runs after first paint, so it loads then.
  const measured = Promise.all([
    import("@/lib/icon-tone-analysis"),
    new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.decoding = "async";
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
