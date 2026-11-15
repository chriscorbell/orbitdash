/** Narrowest a category column may get, and the gap between columns, in pixels. */
export const COLUMN_MIN_WIDTH = 224;
export const COLUMN_GAP = 24;
export const MAX_COLUMNS = 5;

/** Approximate rendered heights in pixels: close enough to balance columns without measuring. */
const CATEGORY_HEADER_HEIGHT = 40;
const CARD_HEIGHT = 46;

/** How many columns of at least `minWidth` fit in `width`, from 1 up to `max`. */
export function columnCountForWidth(
  width: number,
  minWidth = COLUMN_MIN_WIDTH,
  gap = COLUMN_GAP,
  max = MAX_COLUMNS
): number {
  const fit = Math.floor((width + gap) / (minWidth + gap));
  return Math.max(1, Math.min(max, fit));
}

/** Estimated height of a category with this many cards. An empty one keeps room for a drop. */
export function estimateCategoryHeight(cardCount: number): number {
  return CATEGORY_HEADER_HEIGHT + Math.max(1, cardCount) * CARD_HEIGHT;
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
