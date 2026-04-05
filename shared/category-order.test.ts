import { describe, expect, it } from "vitest";
import {
  mergeCategoryOrder,
  sanitizeCategoryOrder,
  UNCATEGORIZED_CATEGORY,
} from "@shared/category-order";

describe("sanitizeCategoryOrder", () => {
  it("trims values, removes duplicates, and excludes uncategorized", () => {
    expect(
      sanitizeCategoryOrder([" Media ", "", "Infrastructure", UNCATEGORIZED_CATEGORY, "Media"])
    ).toEqual(["Media", "Infrastructure"]);
  });
});

describe("mergeCategoryOrder", () => {
  it("preserves saved order for known categories and appends the rest alphabetically", () => {
    expect(
      mergeCategoryOrder(
        ["Media", "Infrastructure", "Monitoring", "Infrastructure"],
        ["Monitoring", "Missing", "Media"]
      )
    ).toEqual(["Monitoring", "Media", "Infrastructure"]);
  });

  it("returns a deterministic alphabetical order when there is no saved order", () => {
    expect(mergeCategoryOrder(["Zeta", "Alpha", "Beta"], [])).toEqual(["Alpha", "Beta", "Zeta"]);
  });
});
