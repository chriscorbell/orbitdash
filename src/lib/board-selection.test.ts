import { describe, expect, it } from "vitest";
import { groupSelectionState, toggleGroupSelection, toggleSelection } from "@/lib/board-selection";

const order = ["a", "b", "c", "d", "e"];

describe("toggleSelection", () => {
  it("adds and removes a single card", () => {
    const one = toggleSelection(new Set(), "b", { anchor: null, order, range: false });
    expect([...one]).toEqual(["b"]);
    expect([...toggleSelection(one, "b", { anchor: "b", order, range: false })]).toEqual([]);
  });

  it("selects the run between the anchor and the card on shift-click, either direction", () => {
    const start = new Set(["b"]);
    expect([...toggleSelection(start, "d", { anchor: "b", order, range: true })].sort()).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect([...toggleSelection(start, "a", { anchor: "b", order, range: true })].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps cards selected elsewhere when adding a range", () => {
    const start = new Set(["e", "b"]);
    expect([...toggleSelection(start, "c", { anchor: "b", order, range: true })].sort()).toEqual([
      "b",
      "c",
      "e",
    ]);
  });

  it("falls back to a single toggle without a usable anchor", () => {
    expect([...toggleSelection(new Set(), "c", { anchor: null, order, range: true })]).toEqual([
      "c",
    ]);
    expect([...toggleSelection(new Set(), "c", { anchor: "gone", order, range: true })]).toEqual([
      "c",
    ]);
  });
});

describe("category selection", () => {
  it("reports none, some or all", () => {
    expect(groupSelectionState(new Set(), ["a", "b"])).toBe(false);
    expect(groupSelectionState(new Set(["a"]), ["a", "b"])).toBe("indeterminate");
    expect(groupSelectionState(new Set(["a", "b", "z"]), ["a", "b"])).toBe(true);
    expect(groupSelectionState(new Set(["a"]), [])).toBe(false);
  });

  it("selects the rest of a category, or clears it once all are selected", () => {
    const some = new Set(["a", "z"]);
    expect([...toggleGroupSelection(some, ["a", "b"])].sort()).toEqual(["a", "b", "z"]);
    expect([...toggleGroupSelection(new Set(["a", "b", "z"]), ["a", "b"])]).toEqual(["z"]);
  });
});
