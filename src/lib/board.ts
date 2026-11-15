import type { Board, Category, Layout, Link } from "../../shared/types.ts";

/** Container key for links without a category; category ids are UUIDs, so it can't collide. */
export const UNGROUPED = "ungrouped";

export interface CategoryGroup {
  category: Category;
  links: Link[];
}

export function groupBoard(board: Board): { ungrouped: Link[]; groups: CategoryGroup[] } {
  const byCategory = new Map<string, Link[]>(board.categories.map((category) => [category.id, []]));
  const ungrouped: Link[] = [];
  for (const link of board.links) {
    const list = link.categoryId ? byCategory.get(link.categoryId) : undefined;
    (list ?? ungrouped).push(link);
  }
  return {
    ungrouped,
    groups: board.categories.map((category) => ({ category, links: byCategory.get(category.id)! })),
  };
}

/** Link ids per container, the shape drag and drop works on. */
export type Containers = Record<string, string[]>;

export function toContainers(board: Board): Containers {
  const { ungrouped, groups } = groupBoard(board);
  const containers: Containers = { [UNGROUPED]: ungrouped.map((link) => link.id) };
  for (const group of groups) containers[group.category.id] = group.links.map((link) => link.id);
  return containers;
}

export function toLayout(containers: Containers, categoryOrder: string[]): Layout {
  return {
    ungrouped: containers[UNGROUPED] ?? [],
    categories: categoryOrder.map((id) => ({ id, links: containers[id] ?? [] })),
  };
}

export function layoutOf(board: Board): Layout {
  return toLayout(
    toContainers(board),
    board.categories.map((category) => category.id)
  );
}

/** The board as it will look once the server saves `layout`, for showing a drop right away. */
export function applyLayout(board: Board, layout: Layout): Board {
  const categories = new Map(board.categories.map((category) => [category.id, category]));
  const links = new Map(board.links.map((link) => [link.id, link]));
  const place = (ids: string[], categoryId: string | null) =>
    ids.flatMap((id) => {
      const link = links.get(id);
      return link ? [{ ...link, categoryId }] : [];
    });
  return {
    categories: layout.categories.flatMap((entry) => {
      const category = categories.get(entry.id);
      return category ? [category] : [];
    }),
    links: [
      ...place(layout.ungrouped, null),
      ...layout.categories.flatMap((entry) => place(entry.links, entry.id)),
    ],
  };
}

/** The layout with one category moved `offset` places earlier (negative) or later. */
export function moveCategory(board: Board, id: string, offset: number): Layout | null {
  const order = board.categories.map((category) => category.id);
  const from = order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return null;
  order.splice(to, 0, ...order.splice(from, 1));
  return toLayout(toContainers(board), order);
}

export function sameLayout(left: Layout, right: Layout): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
