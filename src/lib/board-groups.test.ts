import { describe, expect, it } from "vitest";
import {
  applyServiceMove,
  buildBoardGroups,
  moveItem,
  uniqueCategoryName,
  UNCATEGORIZED_KEY,
} from "@/lib/board-groups";
import type { Category, Service } from "@shared/types";

function category(id: string, name: string, position: number): Category {
  return { id, name, position, created_at: 1, updated_at: 1 };
}

function service(id: string, categoryId: string | null, position: number, name = id): Service {
  return {
    id,
    name,
    url: `https://${id}.example.com`,
    description: null,
    icon: null,
    icon_source_url: null,
    category: categoryId ? categoryId.toUpperCase() : null,
    category_id: categoryId,
    position,
    open_in_new_tab: true,
    created_at: 1,
    updated_at: 1,
    check_enabled: false,
    check_method: "http",
    check_target: null,
    check_interval: 60,
    check_ignore_tls: false,
    external_url: null,
    links: [],
    tags: [],
  };
}

const categories = [category("media", "Media", 0), category("infra", "Infra", 1)];

function layout(services: Service[]) {
  return buildBoardGroups(categories, services, { includeEmpty: true }).map(
    (group) => `${group.key}:${group.services.map((entry) => entry.id).join(",")}`
  );
}

describe("buildBoardGroups", () => {
  it("groups services by category id in category order, uncategorized last", () => {
    const groups = buildBoardGroups(categories, [
      service("loose", null, 0),
      service("nas", "infra", 0),
      service("plex", "media", 1),
      service("jelly", "media", 0),
    ]);

    expect(groups.map((group) => [group.key, group.name])).toEqual([
      ["media", "Media"],
      ["infra", "Infra"],
      [UNCATEGORIZED_KEY, "Uncategorized"],
    ]);
    expect(groups[0].services.map((entry) => entry.id)).toEqual(["jelly", "plex"]);
    expect(groups[2].categoryId).toBeNull();
  });

  it("leaves out empty categories unless asked", () => {
    const services = [service("plex", "media", 0)];
    expect(buildBoardGroups(categories, services).map((group) => group.key)).toEqual(["media"]);
    expect(
      buildBoardGroups(categories, services, { includeEmpty: true }).map((group) => group.key)
    ).toEqual(["media", "infra"]);
  });

  it("keeps services whose category is not listed yet", () => {
    const groups = buildBoardGroups(categories, [service("new", "games", 0)]);
    expect(groups).toEqual([
      expect.objectContaining({ key: "games", categoryId: "games", name: "GAMES" }),
    ]);
  });

  it("names an unlisted category without a name as uncategorized", () => {
    const orphan = { ...service("odd", "gone", 0), category: null };
    expect(buildBoardGroups([], [orphan])[0].name).toBe("Uncategorized");
  });
});

describe("applyServiceMove", () => {
  const services = [
    service("a", "media", 0),
    service("b", "media", 1),
    service("c", "media", 2),
    service("x", "infra", 0),
  ];

  it("reorders within a category", () => {
    const moved = applyServiceMove(services, {
      id: "c",
      categoryId: "media",
      categoryName: "Media",
      index: 0,
    });
    expect(layout(moved)).toEqual(["media:c,a,b", "infra:x"]);
  });

  it("moves between categories and renumbers both", () => {
    const moved = applyServiceMove(services, {
      id: "a",
      categoryId: "infra",
      categoryName: "Infra",
      index: 1,
    });
    expect(layout(moved)).toEqual(["media:b,c", "infra:x,a"]);
    expect(moved.find((entry) => entry.id === "a")).toMatchObject({
      category: "Infra",
      category_id: "infra",
      position: 1,
    });
    expect(moved.find((entry) => entry.id === "b")?.position).toBe(0);
  });

  it("clamps the index and can move a service out of every category", () => {
    const moved = applyServiceMove(services, {
      id: "b",
      categoryId: null,
      categoryName: null,
      index: 99,
    });
    expect(layout(moved)).toEqual(["media:a,c", "infra:x", `${UNCATEGORIZED_KEY}:b`]);
  });

  it("ignores unknown services", () => {
    expect(
      applyServiceMove(services, { id: "nope", categoryId: null, categoryName: null, index: 0 })
    ).toEqual(services);
  });
});

describe("moveItem", () => {
  it("moves an entry forwards and backwards", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});

describe("uniqueCategoryName", () => {
  it("numbers the default name when it is taken", () => {
    expect(uniqueCategoryName([])).toBe("New category");
    expect(
      uniqueCategoryName([category("1", "New category", 0), category("2", "new category 2", 1)])
    ).toBe("New category 3");
  });
});
