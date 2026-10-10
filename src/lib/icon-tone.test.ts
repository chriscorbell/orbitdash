// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyIconPixels,
  getCachedIconTone,
  measureIconTone,
  perceivedLightness,
  resetIconTonesForTesting,
} from "@/lib/icon-tone";

/** RGBA data for `total` pixels, the first `filled` of which have the given color. */
function pixels(total: number, filled: number, color: [number, number, number]) {
  const data = new Uint8ClampedArray(total * 4);
  for (let index = 0; index < filled; index += 1) {
    data.set([...color, 255], index * 4);
  }
  return data;
}

afterEach(() => {
  window.localStorage.clear();
  resetIconTonesForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Images that "load" (or fail) on the next tick, and a canvas that returns the given pixels. */
function stubImageLoading(result: {
  fail?: boolean;
  pixels?: Uint8ClampedArray;
  context?: boolean;
}) {
  const loads: string[] = [];
  class FakeImage {
    naturalWidth = 64;
    naturalHeight = 32;
    decoding = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      loads.push(value);
      setTimeout(() => (result.fail ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);

  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const element = createElement(tag);
    if (tag === "canvas") {
      const context =
        result.context === false
          ? null
          : {
              drawImage: vi.fn(),
              getImageData: () => ({ data: result.pixels ?? new Uint8ClampedArray(0) }),
            };
      Object.assign(element, { getContext: () => context });
    }
    return element;
  });
  return loads;
}

describe("classifyIconPixels", () => {
  it("calls a mostly black glyph dark and a mostly white one light", () => {
    expect(classifyIconPixels(pixels(100, 40, [20, 20, 20]))).toBe("dark");
    expect(classifyIconPixels(pixels(100, 40, [250, 250, 250]))).toBe("light");
  });

  it("leaves colorful icons alone, including saturated red", () => {
    expect(classifyIconPixels(pixels(100, 40, [40, 140, 240]))).toBe("normal");
    expect(classifyIconPixels(pixels(100, 40, [255, 0, 0]))).toBe("normal");
  });

  it("leaves icons that bring their own background alone", () => {
    expect(classifyIconPixels(pixels(100, 95, [10, 10, 10]))).toBe("normal");
  });

  it("ignores nearly empty or empty images", () => {
    expect(classifyIconPixels(pixels(100, 1, [0, 0, 0]))).toBe("normal");
    expect(classifyIconPixels([])).toBe("normal");
  });

  it("needs a clear majority before choosing a tone", () => {
    const data = pixels(100, 40, [20, 20, 20]);
    data.set(pixels(20, 20, [240, 60, 60]), 0);
    expect(classifyIconPixels(data)).toBe("normal");
  });
});

describe("perceivedLightness", () => {
  it("runs from black to white", () => {
    expect(perceivedLightness(0, 0, 0)).toBe(0);
    expect(perceivedLightness(255, 255, 255)).toBeCloseTo(100, 0);
    expect(perceivedLightness(255, 0, 0)).toBeCloseTo(53, 0);
  });
});

describe("tone cache", () => {
  it("reads tones saved by an earlier visit and skips bad entries", () => {
    window.localStorage.setItem(
      "orbitdash.iconTones",
      JSON.stringify({ "/api/icons/a.png": "dark", "/api/icons/b.png": "purple" })
    );
    expect(getCachedIconTone("/api/icons/a.png")).toBe("dark");
    expect(getCachedIconTone("/api/icons/b.png")).toBeUndefined();
  });

  it("survives a corrupt cache", () => {
    window.localStorage.setItem("orbitdash.iconTones", "{nope");
    expect(getCachedIconTone("/api/icons/a.png")).toBeUndefined();
  });

  it("answers from the cache without loading the image again", async () => {
    window.localStorage.setItem("orbitdash.iconTones", JSON.stringify({ "/x.png": "light" }));
    await expect(measureIconTone("/x.png")).resolves.toBe("light");
  });

  it("measures an icon once, then remembers it across visits", async () => {
    const loads = stubImageLoading({ pixels: pixels(1024, 400, [15, 15, 15]) });

    const [first, second] = await Promise.all([
      measureIconTone("/api/icons/dark.svg"),
      measureIconTone("/api/icons/dark.svg"),
    ]);

    expect(first).toBe("dark");
    expect(second).toBe("dark");
    expect(loads).toEqual(["/api/icons/dark.svg"]);
    expect(JSON.parse(window.localStorage.getItem("orbitdash.iconTones")!)).toEqual({
      "/api/icons/dark.svg": "dark",
    });
  });

  it("treats icons it cannot load or read as normal", async () => {
    stubImageLoading({ fail: true });
    await expect(measureIconTone("/api/icons/missing.png")).resolves.toBe("normal");

    resetIconTonesForTesting();
    vi.restoreAllMocks();
    stubImageLoading({ context: false });
    await expect(measureIconTone("/api/icons/no-canvas.png")).resolves.toBe("normal");
  });
});
