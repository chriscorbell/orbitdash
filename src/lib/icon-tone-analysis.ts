import type { IconTone } from "@/lib/icon-tone";

const SAMPLE_SIZE = 32;

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

/** Samples an image on a small canvas and classifies it. */
export function analyzeImage(image: HTMLImageElement): IconTone {
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
