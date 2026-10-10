import { describe, expect, it } from "vitest";
import { fuzzyScore, scoreFields } from "@/lib/fuzzy";

describe("fuzzyScore", () => {
  it("ranks exact, prefix, word start, substring and scattered matches in that order", () => {
    const exact = fuzzyScore("plex", "Plex")!;
    const prefix = fuzzyScore("jelly", "Jellyfin")!;
    const word = fuzzyScore("assist", "Home Assistant")!;
    const inside = fuzzyScore("fin", "Jellyfin")!;
    const scattered = fuzzyScore("hass", "Home Assistant")!;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
  });

  it("ignores case and accents, and matches everything for an empty query", () => {
    expect(fuzzyScore("CAFE", "Café")).toBe(100);
    expect(fuzzyScore("  ", "anything")).toBe(0);
  });

  it("returns null when letters are missing, out of order, or the text is empty", () => {
    expect(fuzzyScore("xyz", "Jellyfin")).toBeNull();
    expect(fuzzyScore("nif", "fin")).toBeNull();
    expect(fuzzyScore("a", "")).toBeNull();
  });

  it("treats URL separators as word starts and survives regex characters", () => {
    expect(fuzzyScore("example", "https://example.com")!).toBeGreaterThan(
      fuzzyScore("xample", "https://example.com")!
    );
    expect(fuzzyScore("c++", "c++ docs")).toBeGreaterThan(0);
  });
});

describe("scattered matches", () => {
  it("can be turned off for a field", () => {
    expect(fuzzyScore("nas", "Infrastructure")).toBeGreaterThan(0);
    expect(fuzzyScore("nas", "Infrastructure", { scattered: false })).toBeNull();
    expect(fuzzyScore("struct", "Infrastructure", { scattered: false })).toBeGreaterThan(0);
  });
});

describe("scoreFields", () => {
  it("takes the best weighted field and skips empty ones", () => {
    const fields = [
      { text: "Media", weight: 0.6 },
      { text: null, weight: 1 },
      { text: "Plex", weight: 1 },
    ];
    expect(scoreFields("plex", fields)).toBe(100);
    expect(scoreFields("media", fields)).toBe(60);
    expect(scoreFields("zzz", fields)).toBeNull();
  });
});
