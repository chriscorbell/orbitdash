import { useMemo, type ReactNode } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { COLUMN_MIN_WIDTH, columnCountForWidth, distributeIntoColumns } from "@/lib/board-layout";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";

const COLUMN_GAP = 24;
const MAX_COLUMNS = 6;

interface BoardColumnsProps<G extends { key: string }> {
  density: CardDensity;
  groups: readonly G[];
  mode: BoardMode;
  /** Estimated height of a group, used to balance the columns. */
  heightOf: (group: G) => number;
  renderGroup: (group: G) => ReactNode;
}

/**
 * Lays out category groups: side by side in balanced columns, or stacked as rows. Both the normal
 * board and the editable one use it, so entering edit mode keeps everything where it was.
 */
export function BoardColumns<G extends { key: string }>({
  density,
  groups,
  mode,
  heightOf,
  renderGroup,
}: BoardColumnsProps<G>) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  // Categories and cards marked with data-flip-key glide to new spots when the layout changes.
  const flipRef = useFlipAnimation<HTMLDivElement>();
  const columnCount = columnCountForWidth(
    width,
    COLUMN_MIN_WIDTH[density],
    COLUMN_GAP,
    MAX_COLUMNS
  );

  const columns = useMemo(
    () => (mode === "columns" ? distributeIntoColumns(groups, columnCount, heightOf) : [groups]),
    [columnCount, groups, heightOf, mode]
  );

  return (
    <div ref={flipRef}>
      {mode === "rows" ? (
        <div className="space-y-6">{groups.map(renderGroup)}</div>
      ) : (
        <div ref={ref} data-columns={columns.length} className="flex items-start gap-6">
          {columns.map((column, index) => (
            <div key={index} className="flex min-w-0 flex-1 flex-col gap-6">
              {column.map(renderGroup)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
