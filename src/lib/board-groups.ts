import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Category, Service } from "@shared/types";

/** Group key for services without a category; categories use their id. */
export const UNCATEGORIZED_KEY = "uncategorized";

export interface BoardGroup {
  /** Category id, or UNCATEGORIZED_KEY. */
  key: string;
  categoryId: string | null;
  name: string;
  services: Service[];
}

export function compareServices(left: Service, right: Service) {
  return left.position - right.position || left.name.localeCompare(right.name);
}

/**
 * Services grouped by category, in the categories' saved order, uncategorized last. Empty
 * categories are left out unless asked for (edit mode shows them as drop targets). A service whose
 * category is not in the list yet (the category list is refetching) gets a group at the end.
 */
export function buildBoardGroups(
  categories: readonly Category[],
  services: readonly Service[],
  { includeEmpty = false }: { includeEmpty?: boolean } = {}
): BoardGroup[] {
  const groups = new Map<string, BoardGroup>();
  for (const category of categories) {
    groups.set(category.id, {
      key: category.id,
      categoryId: category.id,
      name: category.name,
      services: [],
    });
  }

  const uncategorized: Service[] = [];
  for (const service of [...services].sort(compareServices)) {
    if (service.category_id === null) {
      uncategorized.push(service);
      continue;
    }
    let group = groups.get(service.category_id);
    if (!group) {
      group = {
        key: service.category_id,
        categoryId: service.category_id,
        name: service.category ?? UNCATEGORIZED_CATEGORY,
        services: [],
      };
      groups.set(service.category_id, group);
    }
    group.services.push(service);
  }

  const result = [...groups.values()].filter((group) => includeEmpty || group.services.length > 0);
  if (uncategorized.length > 0) {
    result.push({
      key: UNCATEGORIZED_KEY,
      categoryId: null,
      name: UNCATEGORIZED_CATEGORY,
      services: uncategorized,
    });
  }
  return result;
}

export interface ServiceMove {
  id: string;
  categoryId: string | null;
  /** The category's display name, kept on the service for older clients. */
  categoryName: string | null;
  /** Position within the target category once the service is there. */
  index: number;
}

/** The service list after a move, renumbering positions the way the server does. */
export function applyServiceMove(services: readonly Service[], move: ServiceMove): Service[] {
  const moving = services.find((service) => service.id === move.id);
  if (!moving) return [...services];

  const inCategory = (categoryId: string | null) =>
    services
      .filter((service) => service.category_id === categoryId && service.id !== move.id)
      .sort(compareServices);

  const target = inCategory(move.categoryId);
  target.splice(Math.max(0, Math.min(move.index, target.length)), 0, {
    ...moving,
    category_id: move.categoryId,
    category: move.categoryName,
  });

  const updated = new Map<string, Service>();
  target.forEach((service, position) => updated.set(service.id, { ...service, position }));
  if (moving.category_id !== move.categoryId) {
    inCategory(moving.category_id).forEach((service, position) =>
      updated.set(service.id, { ...service, position })
    );
  }

  return services.map((service) => updated.get(service.id) ?? service);
}

/** Moves one entry of a list to another index (the same as dnd-kit's arrayMove). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A category name not used yet: "New category", then "New category 2" and so on. */
export function uniqueCategoryName(categories: readonly Category[], base = "New category") {
  const names = new Set(categories.map((category) => category.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}
