import type { CardDensity } from "@shared/dashboard-settings";

/** Narrowest a category column may get in the columns layout, in pixels. */
export const COLUMN_MIN_WIDTH: Record<CardDensity, number> = {
  compact: 224,
  comfortable: 256,
  tiles: 288,
};

/** Approximate rendered heights in pixels, close enough to balance columns without measuring. */
const CATEGORY_HEADER_HEIGHT = 44;
const CARD_HEIGHT: Record<CardDensity, number> = {
  compact: 44,
  comfortable: 60,
  tiles: 104,
};
const TILES_PER_COLUMN_ROW = 3;

/** How many columns of at least `minWidth` fit in `width`, from 1 up to `max`. */
export function columnCountForWidth(
  width: number,
  minWidth: number,
  gap: number,
  max: number
): number {
  const fit = Math.floor((width + gap) / (minWidth + gap));
  return Math.max(1, Math.min(max, fit));
}

/** Estimated height of one category in the columns layout. */
export function estimateCategoryHeight(
  cardCount: number,
  density: CardDensity,
  collapsed: boolean
): number {
  if (collapsed) return CATEGORY_HEADER_HEIGHT;
  const rows = density === "tiles" ? Math.ceil(cardCount / TILES_PER_COLUMN_ROW) : cardCount;
  return CATEGORY_HEADER_HEIGHT + rows * CARD_HEIGHT[density];
}

/**
 * Deals items into columns, each going to the currently shortest column (the leftmost on ties).
 * The first items land left to right, so the saved order still reads naturally, and the columns
 * end up close in height instead of leaving one long and the rest half empty.
 */
export function distributeIntoColumns<T>(
  items: readonly T[],
  columnCount: number,
  heightOf: (item: T) => number
): T[][] {
  const count = Math.max(1, Math.min(columnCount, items.length));
  const columns: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);

  for (const item of items) {
    let target = 0;
    for (let index = 1; index < count; index += 1) {
      if (heights[index] < heights[target]) target = index;
    }
    columns[target].push(item);
    heights[target] += heightOf(item);
  }

  return columns;
}
