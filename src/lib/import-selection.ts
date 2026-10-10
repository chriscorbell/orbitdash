import type { ImportPreview, ImportServiceInput } from "@shared/types";

/** Which services are picked, keyed "group:service", and the category each group goes into. */
export interface ImportSelection {
  picked: ReadonlySet<string>;
  categories: readonly string[];
}

export const serviceKey = (group: number, service: number) => `${group}:${service}`;

export const FORMAT_NAMES: Record<ImportPreview["format"], string> = {
  bookmarks: "browser bookmarks",
  dashy: "Dashy",
  homarr: "Homarr",
  homepage: "Homepage",
  homer: "Homer",
  "orbitdash-seed": "an orbitdash seed file",
};

/** Everything except links that are already on the dashboard, each group into its own name. */
export function initialSelection(preview: ImportPreview): ImportSelection {
  const picked = new Set<string>();
  preview.groups.forEach((group, groupIndex) =>
    group.services.forEach((service, serviceIndex) => {
      if (!service.duplicate) picked.add(serviceKey(groupIndex, serviceIndex));
    })
  );
  return { picked, categories: preview.groups.map((group) => group.name) };
}

export function toggleService(selection: ImportSelection, key: string): ImportSelection {
  const picked = new Set(selection.picked);
  if (picked.has(key)) picked.delete(key);
  else picked.add(key);
  return { ...selection, picked };
}

/** "all", "none" or "some" of a group's services are picked. */
export function groupState(
  selection: ImportSelection,
  preview: ImportPreview,
  group: number
): "all" | "none" | "some" {
  const keys = preview.groups[group].services.map((_, index) => serviceKey(group, index));
  const count = keys.filter((key) => selection.picked.has(key)).length;
  return count === 0 ? "none" : count === keys.length ? "all" : "some";
}

/** Picks the whole group, or clears it when it is already fully picked. */
export function toggleGroup(
  selection: ImportSelection,
  preview: ImportPreview,
  group: number
): ImportSelection {
  const picked = new Set(selection.picked);
  const pickAll = groupState(selection, preview, group) !== "all";
  preview.groups[group].services.forEach((_, index) => {
    if (pickAll) picked.add(serviceKey(group, index));
    else picked.delete(serviceKey(group, index));
  });
  return { ...selection, picked };
}

export function renameGroupCategory(
  selection: ImportSelection,
  group: number,
  category: string
): ImportSelection {
  const categories = [...selection.categories];
  categories[group] = category;
  return { ...selection, categories };
}

/** The picked services in file order, each with its group's category (blank is uncategorized). */
export function selectedServices(
  selection: ImportSelection,
  preview: ImportPreview
): ImportServiceInput[] {
  return preview.groups.flatMap((group, groupIndex) =>
    group.services
      .filter((_, serviceIndex) => selection.picked.has(serviceKey(groupIndex, serviceIndex)))
      .map((service) => ({
        name: service.name,
        url: service.url,
        description: service.description,
        iconUrl: service.iconUrl,
        category: selection.categories[groupIndex]?.trim() || null,
      }))
  );
}
