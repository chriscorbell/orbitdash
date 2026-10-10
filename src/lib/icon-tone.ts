/**
 * Icon tone: whether an icon is mostly very dark or very light. A dark glyph disappears on the dark
 * theme (and a white one on the light theme), so cards put those icons on a contrasting plate.
 */
export type IconTone = "dark" | "light" | "normal";

const SAMPLE_SIZE = 32;
const CACHE_KEY = "orbitdash.iconTones";
const CACHE_LIMIT = 300;

/** Alpha above which a pixel counts as part of the icon. */
const VISIBLE_ALPHA = 40;
/** Share of the canvas an icon must cover before it is judged at all. */
const MIN_COVERAGE = 0.02;
/** Icons that fill nearly the whole square bring their own background. */
const SELF_BACKED_COVERAGE = 0.9;
/** Share of an icon's visible pixels that must be dark (or light) to call the whole icon so. */
const DOMINANT_SHARE = 0.75;
/** CIE L* bounds (0 black to 100 white); saturated colors like pure red sit in between. */
const DARK_LIGHTNESS = 30;
const LIGHT_LIGHTNESS = 88;

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Perceived lightness of an sRGB color, as CIE L*. */
export function perceivedLightness(red: number, green: number, blue: number): number {
  const y = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** Classifies RGBA pixel data (as from `getImageData`). */
export function classifyIconPixels(data: ArrayLike<number>): IconTone {
  const pixelCount = data.length / 4;
  let visible = 0;
  let dark = 0;
  let light = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < VISIBLE_ALPHA) continue;
    visible += 1;
    const lightness = perceivedLightness(data[offset], data[offset + 1], data[offset + 2]);
    if (lightness < DARK_LIGHTNESS) dark += 1;
    else if (lightness > LIGHT_LIGHTNESS) light += 1;
  }

  const coverage = pixelCount === 0 ? 0 : visible / pixelCount;
  if (coverage < MIN_COVERAGE || coverage > SELF_BACKED_COVERAGE) return "normal";
  if (dark / visible >= DOMINANT_SHARE) return "dark";
  if (light / visible >= DOMINANT_SHARE) return "light";
  return "normal";
}

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

function analyzeImage(image: HTMLImageElement): IconTone {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "normal";

  const scale = Math.min(
    SAMPLE_SIZE / (image.naturalWidth || SAMPLE_SIZE),
    SAMPLE_SIZE / (image.naturalHeight || SAMPLE_SIZE)
  );
  const width = (image.naturalWidth || SAMPLE_SIZE) * scale;
  const height = (image.naturalHeight || SAMPLE_SIZE) * scale;
  context.drawImage(image, (SAMPLE_SIZE - width) / 2, (SAMPLE_SIZE - height) / 2, width, height);
  return classifyIconPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}

/** Measures an icon once per URL; same-origin icons only, anything unreadable counts as normal. */
export function measureIconTone(src: string): Promise<IconTone> {
  const cached = getCachedIconTone(src);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  const measured = new Promise<IconTone>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(analyzeImage(image));
      } catch {
        resolve("normal");
      }
    };
    image.onerror = () => resolve("normal");
    image.src = src;
  }).then((tone) => {
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
