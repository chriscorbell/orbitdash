import { describe, expect, it } from "vitest";
import { MAX_SERVICE_TAGS, normalizeTag, normalizeTags, TAG_MAX_LENGTH } from "./tags";

describe("normalizeTag", () => {
  it("trims, collapses spaces and lowercases", () => {
    expect(normalizeTag("  Home   Lab ")).toBe("home lab");
    expect(normalizeTag("Media")).toBe("media");
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("normalizeTags", () => {
  it("drops blanks and repeats that differ only in case or spacing, keeping first order", () => {
    expect(normalizeTags(["Media", "video", " media", "", "  ", "VIDEO "])).toEqual({
      ok: true,
      value: ["media", "video"],
    });
    expect(normalizeTags([])).toEqual({ ok: true, value: [] });
  });

  it("splits on commas the way the chip input does", () => {
    expect(normalizeTags(["media, video,,4k"])).toEqual({
      ok: true,
      value: ["media", "video", "4k"],
    });
  });

  it("rejects a tag that is too long rather than cutting it short", () => {
    expect(normalizeTags(["x".repeat(TAG_MAX_LENGTH)])).toMatchObject({ ok: true });
    expect(normalizeTags(["x".repeat(TAG_MAX_LENGTH + 1)])).toEqual({
      ok: false,
      error: "tags must be 32 characters or fewer",
    });
  });

  it("rejects more tags than a service can have, counting after repeats are dropped", () => {
    const tags = Array.from({ length: MAX_SERVICE_TAGS }, (_, index) => `tag ${index}`);
    expect(normalizeTags([...tags, "TAG 0"])).toMatchObject({ ok: true });
    expect(normalizeTags([...tags, "one more"])).toEqual({
      ok: false,
      error: "a service can have up to 10 tags",
    });
  });
});
