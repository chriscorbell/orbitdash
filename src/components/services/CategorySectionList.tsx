import { memo, useCallback, useId } from "react";
import { BoardColumns } from "@/components/board/BoardColumns";
import { ServiceCard } from "@/components/ServiceCard";
import { useCollapsedCategories } from "@/components/services/useCollapsedCategories";
import type { BoardGroup } from "@/lib/board-groups";
import { cardListClassName, estimateCategoryHeight, ROW_GRID } from "@/lib/board-layout";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { ChevronDown } from "lucide-react";

interface CategorySectionListProps {
  density: CardDensity;
  groups: readonly BoardGroup[];
  mode: BoardMode;
}

interface CategorySectionProps {
  collapsed: boolean;
  density: CardDensity;
  group: BoardGroup;
  listClassName: string;
  onToggle: (categoryKey: string) => void;
}

const CategorySection = memo(function CategorySection({
  collapsed,
  density,
  group,
  listClassName,
  onToggle,
}: CategorySectionProps) {
  const contentId = useId();

  return (
    <section data-flip-key={`category:${group.key}`} className="space-y-3">
      <h3 className="w-fit max-w-full">
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name} category`}
          className="flex min-h-8 max-w-full items-center gap-1.5 pointer-coarse:min-h-10 rounded-md text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => onToggle(group.key)}
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
          />
          <span className="truncate">{group.name}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground/60">
            {group.services.length}
          </span>
        </button>
      </h3>
      <div
        id={contentId}
        hidden={collapsed}
        className={
          collapsed
            ? "hidden"
            : `${listClassName} animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none`
        }
      >
        {group.services.map((service) => (
          <ServiceCard key={service.id} service={service} density={density} />
        ))}
      </div>
    </section>
  );
});

/** The board outside edit mode: categories of plain links that can be collapsed. */
export function CategorySectionList({ density, groups, mode }: CategorySectionListProps) {
  const { collapsed, toggle } = useCollapsedCategories(groups);
  const heightOf = useCallback(
    (group: BoardGroup) =>
      estimateCategoryHeight(group.services.length, density, collapsed.includes(group.key)),
    [collapsed, density]
  );

  return (
    <BoardColumns
      density={density}
      groups={groups}
      mode={mode}
      heightOf={heightOf}
      renderGroup={(group) => (
        <CategorySection
          key={group.key}
          collapsed={collapsed.includes(group.key)}
          density={density}
          group={group}
          listClassName={cardListClassName(mode, density)}
          onToggle={toggle}
        />
      )}
    />
  );
}

/** Services in one grid, for a board where nothing is categorized. */
export function ServiceGrid({ density, services }: { density: CardDensity; services: Service[] }) {
  return (
    <div className={ROW_GRID[density]}>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} density={density} />
      ))}
    </div>
  );
}
