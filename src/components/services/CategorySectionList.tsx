import { memo, useId, useMemo } from "react";
import { IconButton } from "@/components/common/IconButton";
import { ServiceCard } from "@/components/ServiceCard";
import { useCollapsedCategories } from "@/components/services/useCollapsedCategories";
import { useElementWidth } from "@/hooks/useElementWidth";
import {
  COLUMN_MIN_WIDTH,
  columnCountForWidth,
  distributeIntoColumns,
  estimateCategoryHeight,
} from "@/lib/board-layout";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { ChevronDown, Pencil } from "lucide-react";

/** Cards fill each row of a category in the rows layout (and when nothing is categorized). */
const ROW_GRID: Record<CardDensity, string> = {
  compact: "grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2",
  comfortable: "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3",
  tiles: "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3",
};

/** Cards stack inside a category column in the columns layout. */
const COLUMN_STACK: Record<CardDensity, string> = {
  compact: "flex flex-col gap-1.5",
  comfortable: "flex flex-col gap-2",
  tiles: "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2",
};

const COLUMN_GAP = 24;
const MAX_COLUMNS = 6;

export interface ServiceGroup {
  /** Category id, or "uncategorized" for services without one. */
  key: string;
  name: string;
  services: Service[];
}

interface CategorySectionListProps {
  grouped: readonly ServiceGroup[];
  density: CardDensity;
  hasNamedCategories: boolean;
  mode: BoardMode;
  services: Service[];
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
  onEdit: (service: Service) => void;
  onRenameCategory: (category: string) => void;
}

interface CategorySectionProps {
  category: string;
  categoryKey: string;
  collapsed: boolean;
  density: CardDensity;
  gridClassName: string;
  services: Service[];
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
  onEdit: (service: Service) => void;
  onRenameCategory: (category: string) => void;
  onToggle: (categoryKey: string) => void;
}

const CategorySection = memo(function CategorySection({
  category,
  categoryKey,
  collapsed,
  density,
  gridClassName,
  services,
  onDelete,
  onDuplicate,
  onEdit,
  onRenameCategory,
  onToggle,
}: CategorySectionProps) {
  const contentId = useId();

  return (
    <section className="space-y-3">
      <div className="group/header flex w-fit max-w-full items-center gap-1">
        <h3 className="min-w-0">
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${category} category`}
            className="flex min-h-8 items-center gap-1.5 rounded-md text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onToggle(categoryKey)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
            />
            <span className="truncate">{category}</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground/60">
              {services.length}
            </span>
          </button>
        </h3>
        {category !== UNCATEGORIZED_CATEGORY && (
          <IconButton
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100 pointer-coarse:opacity-100"
            tooltip="Rename category"
            aria-label={`Rename ${category} category`}
            onClick={() => onRenameCategory(category)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
      <div id={contentId} hidden={collapsed} className={collapsed ? "hidden" : gridClassName}>
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            density={density}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
});

function CategorizedSectionList({
  grouped,
  density,
  mode,
  onDelete,
  onDuplicate,
  onEdit,
  onRenameCategory,
}: Omit<CategorySectionListProps, "hasNamedCategories" | "services">) {
  const { collapsed, toggle } = useCollapsedCategories(grouped);
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const columnCount = columnCountForWidth(
    width,
    COLUMN_MIN_WIDTH[density],
    COLUMN_GAP,
    MAX_COLUMNS
  );

  const columns = useMemo(
    () =>
      mode === "columns"
        ? distributeIntoColumns(grouped, columnCount, (group) =>
            estimateCategoryHeight(group.services.length, density, collapsed.includes(group.key))
          )
        : [grouped],
    [collapsed, columnCount, density, grouped, mode]
  );

  const renderSection = (group: ServiceGroup) => (
    <CategorySection
      key={group.key}
      category={group.name}
      categoryKey={group.key}
      collapsed={collapsed.includes(group.key)}
      density={density}
      gridClassName={mode === "columns" ? COLUMN_STACK[density] : ROW_GRID[density]}
      services={group.services}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onRenameCategory={onRenameCategory}
      onToggle={toggle}
    />
  );

  if (mode === "rows") {
    return <div className="space-y-6">{grouped.map(renderSection)}</div>;
  }

  return (
    <div ref={ref} data-columns={columns.length} className="flex items-start gap-6">
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-6">
          {column.map(renderSection)}
        </div>
      ))}
    </div>
  );
}

export function CategorySectionList({
  grouped,
  density,
  hasNamedCategories,
  mode,
  services,
  onDelete,
  onDuplicate,
  onEdit,
  onRenameCategory,
}: CategorySectionListProps) {
  if (hasNamedCategories) {
    return (
      <CategorizedSectionList
        grouped={grouped}
        density={density}
        mode={mode}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
        onRenameCategory={onRenameCategory}
      />
    );
  }

  return (
    <div className={ROW_GRID[density]}>
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          density={density}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
