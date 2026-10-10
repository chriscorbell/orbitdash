import { describe, expect, it } from "vitest";
import {
  columnCountForWidth,
  distributeIntoColumns,
  estimateCategoryHeight,
} from "@/lib/board-layout";

describe("columnCountForWidth", () => {
  it("fits as many minimum-width columns as the width allows", () => {
    expect(columnCountForWidth(1232, 256, 24, 8)).toBe(4);
    expect(columnCountForWidth(1232, 224, 24, 8)).toBe(5);
  });

  it("never returns fewer than one or more than the cap", () => {
    expect(columnCountForWidth(0, 256, 24, 8)).toBe(1);
    expect(columnCountForWidth(5000, 256, 24, 3)).toBe(3);
  });
});

describe("estimateCategoryHeight", () => {
  it("grows with the number of cards", () => {
    expect(estimateCategoryHeight(3, "comfortable", false)).toBeGreaterThan(
      estimateCategoryHeight(1, "comfortable", false)
    );
  });

  it("packs tiles three to a row", () => {
    expect(estimateCategoryHeight(3, "tiles", false)).toBe(
      estimateCategoryHeight(1, "tiles", false)
    );
    expect(estimateCategoryHeight(4, "tiles", false)).toBeGreaterThan(
      estimateCategoryHeight(3, "tiles", false)
    );
  });

  it("counts only the header for a collapsed category", () => {
    expect(estimateCategoryHeight(12, "compact", true)).toBe(
      estimateCategoryHeight(0, "compact", false)
    );
  });
});

describe("distributeIntoColumns", () => {
  const height = (value: number) => value;

  it("deals the first items left to right", () => {
    expect(distributeIntoColumns([1, 1, 1], 3, height)).toEqual([[1], [1], [1]]);
  });

  it("puts each later item in the shortest column", () => {
    expect(distributeIntoColumns([5, 1, 1, 1], 2, height)).toEqual([[5], [1, 1, 1]]);
    expect(distributeIntoColumns([2, 3, 1, 4], 2, height)).toEqual([[2, 1, 4], [3]]);
  });

  it("uses no more columns than there are items, and at least one", () => {
    expect(distributeIntoColumns([1, 2], 4, height)).toEqual([[1], [2]]);
    expect(distributeIntoColumns([], 4, height)).toEqual([[]]);
    expect(distributeIntoColumns([1, 2], 0, height)).toEqual([[1, 2]]);
  });
});
