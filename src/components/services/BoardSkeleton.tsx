import type { CardDensity } from "@shared/dashboard-settings";

const CARD_HEIGHT: Record<CardDensity, string> = {
  compact: "h-9",
  comfortable: "h-12",
  tiles: "h-24",
};

// A plausible, varied shape: a few categories of different lengths.
const COLUMNS = [[4, 2], [3, 3], [5], [2, 3]];

/** Placeholder shaped like the board while services first load. */
export function BoardSkeleton({ density }: { density: CardDensity }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <span role="status" className="sr-only">
        Loading services
      </span>
      {COLUMNS.map((column, columnIndex) => (
        <div
          key={columnIndex}
          aria-hidden="true"
          className={`space-y-6 ${columnIndex >= 1 ? "max-sm:hidden" : ""} ${columnIndex >= 2 ? "max-lg:hidden" : ""} ${columnIndex >= 3 ? "max-xl:hidden" : ""}`}
        >
          {column.map((cards, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              <div className="h-4 w-24 rounded bg-muted" />
              <div
                className={density === "tiles" ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}
              >
                {Array.from({ length: cards }, (_, index) => (
                  <div
                    key={index}
                    className={`${CARD_HEIGHT[density]} animate-pulse rounded-xl bg-muted/70 motion-reduce:animate-none`}
                    style={{ animationDelay: `${(columnIndex + index) * 90}ms` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
