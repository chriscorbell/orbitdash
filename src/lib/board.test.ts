import { describe, expect, it } from "vitest";
import type { Board, Link } from "../../shared/types.ts";
import {
  applyLayout,
  groupBoard,
  layoutOf,
  moveCategory,
  sameLayout,
  toContainers,
  toLayout,
  UNGROUPED,
} from "./board.ts";

function link(id: string, categoryId: string | null): Link {
  return { id, categoryId, name: id, url: `https://${id}.example`, icon: null, newTab: true };
}

const board: Board = {
  categories: [
    { id: "media", name: "Media" },
    { id: "tools", name: "Tools" },
    { id: "empty", name: "Empty" },
  ],
  links: [link("loose", null), link("plex", "media"), link("jelly", "media"), link("git", "tools")],
};

describe("groupBoard", () => {
  it("splits links into the ungrouped list and each category, keeping order", () => {
    const { ungrouped, groups } = groupBoard(board);
    expect(ungrouped.map((item) => item.id)).toEqual(["loose"]);
    expect(groups.map((group) => [group.category.id, group.links.map((item) => item.id)])).toEqual([
      ["media", ["plex", "jelly"]],
      ["tools", ["git"]],
      ["empty", []],
    ]);
  });

  it("treats a link pointing at an unknown category as ungrouped", () => {
    const { ungrouped } = groupBoard({ categories: [], links: [link("orphan", "gone")] });
    expect(ungrouped.map((item) => item.id)).toEqual(["orphan"]);
  });
});

describe("containers and layouts", () => {
  it("round-trips a board through containers into a layout", () => {
    expect(toContainers(board)).toEqual({
      [UNGROUPED]: ["loose"],
      media: ["plex", "jelly"],
      tools: ["git"],
      empty: [],
    });
    expect(layoutOf(board)).toEqual({
      ungrouped: ["loose"],
      categories: [
        { id: "media", links: ["plex", "jelly"] },
        { id: "tools", links: ["git"] },
        { id: "empty", links: [] },
      ],
    });
  });

  it("applies a layout to show a drop before the server answers", () => {
    const layout = toLayout(
      { [UNGROUPED]: [], media: ["jelly"], tools: ["git", "plex", "loose"] },
      ["tools", "media", "empty"]
    );
    const next = applyLayout(board, layout);
    expect(next.categories.map((category) => category.id)).toEqual(["tools", "media", "empty"]);
    expect(next.links.map((item) => [item.id, item.categoryId])).toEqual([
      ["git", "tools"],
      ["plex", "tools"],
      ["loose", "tools"],
      ["jelly", "media"],
    ]);
  });

  it("compares layouts by content", () => {
    expect(sameLayout(layoutOf(board), layoutOf(structuredClone(board)))).toBe(true);
    expect(sameLayout(layoutOf(board), moveCategory(board, "tools", -1)!)).toBe(false);
  });
});

describe("moveCategory", () => {
  it("moves a category earlier or later and keeps every link in place", () => {
    const layout = moveCategory(board, "empty", -2)!;
    expect(layout.categories.map((category) => category.id)).toEqual(["empty", "media", "tools"]);
    expect(layout.categories[1].links).toEqual(["plex", "jelly"]);
  });

  it("refuses moves past either end or of unknown categories", () => {
    expect(moveCategory(board, "media", -1)).toBeNull();
    expect(moveCategory(board, "empty", 1)).toBeNull();
    expect(moveCategory(board, "nope", 1)).toBeNull();
  });
});
