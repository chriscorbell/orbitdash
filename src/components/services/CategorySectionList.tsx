import { memo, useId } from "react";
import { IconButton } from "@/components/common/IconButton";
import { ServiceCard } from "@/components/ServiceCard";
import { useCollapsedCategories } from "@/components/services/useCollapsedCategories";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Service } from "@shared/types";
import { ChevronDown, Pencil } from "lucide-react";

export interface ServiceGroup {
  /** Category id, or "uncategorized" for services without one. */
  key: string;
  name: string;
  services: Service[];
}

interface CategorySectionListProps {
  grouped: readonly ServiceGroup[];
  gridClassName: string;
  hasNamedCategories: boolean;
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
  gridClassName,
  onDelete,
  onDuplicate,
  onEdit,
  onRenameCategory,
}: Omit<CategorySectionListProps, "hasNamedCategories" | "services">) {
  const { collapsed, toggle } = useCollapsedCategories(grouped);

  return grouped.map((group) => (
    <CategorySection
      key={group.key}
      category={group.name}
      categoryKey={group.key}
      collapsed={collapsed.includes(group.key)}
      gridClassName={gridClassName}
      services={group.services}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onRenameCategory={onRenameCategory}
      onToggle={toggle}
    />
  ));
}

export function CategorySectionList({
  grouped,
  gridClassName,
  hasNamedCategories,
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
        gridClassName={gridClassName}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
        onRenameCategory={onRenameCategory}
      />
    );
  }

  return (
    <div className={gridClassName}>
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
