import { describe, expect, it } from "vitest";
import { classifyIconPixels, perceivedLightness } from "./icon-tone-analysis.ts";

/** RGBA data for `total` pixels, the first `filled` of which have the given color. */
function pixels(total: number, filled: number, color: [number, number, number]) {
  const data = new Uint8ClampedArray(total * 4);
  for (let index = 0; index < filled; index += 1) {
    data.set([...color, 255], index * 4);
  }
  return data;
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
    data.set(pixels(30, 30, [240, 60, 60]), 0);
    expect(classifyIconPixels(data)).toBe("normal");
  });

  it("only reverses plain dark glyphs; colored logos with dark parts are mixed", () => {
    const halfDark = pixels(100, 40, [20, 20, 20]);
    halfDark.set(pixels(20, 20, [240, 140, 20]), 0);
    expect(classifyIconPixels(halfDark)).toBe("mixed");

    const darkWithGold = pixels(100, 40, [30, 30, 30]);
    darkWithGold.set(pixels(10, 10, [230, 170, 30]), 0);
    expect(classifyIconPixels(darkWithGold)).toBe("mixed");

    const darkWithSpeck = pixels(100, 40, [30, 30, 30]);
    darkWithSpeck.set(pixels(2, 2, [230, 60, 160]), 0);
    expect(classifyIconPixels(darkWithSpeck)).toBe("dark");
  });
});

describe("perceivedLightness", () => {
  it("runs from black to white", () => {
    expect(perceivedLightness(0, 0, 0)).toBe(0);
    expect(perceivedLightness(255, 255, 255)).toBeCloseTo(100, 0);
    expect(perceivedLightness(255, 0, 0)).toBeCloseTo(53, 0);
  });
});
