import { describe, expect, it } from "vitest";
import {
  groupState,
  initialSelection,
  renameGroupCategory,
  selectedServices,
  serviceKey,
  toggleGroup,
  toggleService,
} from "@/lib/import-selection";
import type { ImportPreview } from "@shared/types";

const svc = (name: string, duplicate = false) => ({
  name,
  url: `https://${name.toLowerCase()}.lan`,
  description: null,
  iconUrl: null,
  duplicate,
});

const preview: ImportPreview = {
  format: "homepage",
  groups: [
    { name: "Media", services: [svc("Jellyfin"), svc("Plex", true)] },
    { name: "Infra", services: [svc("Router")] },
  ],
  warnings: [],
};

describe("import selection", () => {
  it("starts with everything but existing links, each group in its own category", () => {
    const selection = initialSelection(preview);
    expect([...selection.picked]).toEqual(["0:0", "1:0"]);
    expect(selection.categories).toEqual(["Media", "Infra"]);
    expect(groupState(selection, preview, 0)).toBe("some");
    expect(groupState(selection, preview, 1)).toBe("all");
  });

  it("toggles single services and whole groups", () => {
    let selection = initialSelection(preview);
    selection = toggleService(selection, serviceKey(0, 1));
    expect(groupState(selection, preview, 0)).toBe("all");
    selection = toggleGroup(selection, preview, 0);
    expect(groupState(selection, preview, 0)).toBe("none");
    selection = toggleGroup(selection, preview, 0);
    expect(groupState(selection, preview, 0)).toBe("all");
    selection = toggleService(selection, serviceKey(1, 0));
    expect(groupState(selection, preview, 1)).toBe("none");
  });

  it("lists picked services in file order with their group's category", () => {
    let selection = initialSelection(preview);
    selection = renameGroupCategory(selection, 0, "  Streaming ");
    selection = renameGroupCategory(selection, 1, " ");
    expect(selectedServices(selection, preview)).toEqual([
      {
        name: "Jellyfin",
        url: "https://jellyfin.lan",
        description: null,
        iconUrl: null,
        category: "Streaming",
      },
      {
        name: "Router",
        url: "https://router.lan",
        description: null,
        iconUrl: null,
        category: null,
      },
    ]);
  });
});
