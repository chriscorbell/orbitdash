/** Edit mode's card selection, as pure functions over a set of service ids. */

export type SelectionState = boolean | "indeterminate";

/**
 * Toggles one card. With `range` (a shift-click), everything from the anchor (the last card
 * toggled) to this one in board order is selected instead, as in a file manager.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
  { anchor, order, range }: { anchor: string | null; order: readonly string[]; range: boolean }
): Set<string> {
  const next = new Set(selected);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (range && from >= 0 && to >= 0) {
    for (const entry of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(entry);
    return next;
  }

  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Whether all, some or none of a category's cards are selected, for its checkbox. */
export function groupSelectionState(
  selected: ReadonlySet<string>,
  ids: readonly string[]
): SelectionState {
  const count = ids.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === ids.length ? true : "indeterminate";
}

/** Selects every card in a category, or clears them when they all already are. */
export function toggleGroupSelection(
  selected: ReadonlySet<string>,
  ids: readonly string[]
): Set<string> {
  const next = new Set(selected);
  const all = groupSelectionState(selected, ids) === true;
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}
