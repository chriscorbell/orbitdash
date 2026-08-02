import { useId } from "react";
import { IconButton } from "@/components/common/IconButton";
import { ServiceCard } from "@/components/ServiceCard";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Service } from "@shared/types";
import { ChevronDown, Pencil } from "lucide-react";

interface CategorySectionListProps {
  grouped: ReadonlyArray<readonly [string, Service[]]>;
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
  collapsed: boolean;
  gridClassName: string;
  services: Service[];
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
  onEdit: (service: Service) => void;
  onRenameCategory: (category: string) => void;
  onToggle: (category: string) => void;
}

function CategorySection({
  category,
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
  const serviceCountLabel = `${services.length} ${services.length === 1 ? "service" : "services"}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${category} category`}
            className="flex min-h-8 w-full items-center gap-1.5 rounded-md text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => onToggle(category)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`}
            />
            <span className="truncate">{category}</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground/80">
              {serviceCountLabel}
            </span>
          </button>
        </h3>
        {category !== UNCATEGORIZED_CATEGORY && (
          <IconButton
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/60 hover:text-foreground"
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
}

function CategorizedSectionList({
  grouped,
  gridClassName,
  onDelete,
  onDuplicate,
  onEdit,
  onRenameCategory,
}: Omit<CategorySectionListProps, "hasNamedCategories" | "services">) {
  const [collapsedCategories, setCollapsedCategories] = useLocalStorageState<string[]>(
    "orbitdash.collapsedCategories",
    []
  );

  const toggleCategory = (category: string) => {
    setCollapsedCategories((currentCategories) =>
      currentCategories.includes(category)
        ? currentCategories.filter((currentCategory) => currentCategory !== category)
        : [...currentCategories, category]
    );
  };

  return grouped.map(([category, categoryServices]) => (
    <CategorySection
      key={category}
      category={category}
      collapsed={collapsedCategories.includes(category)}
      gridClassName={gridClassName}
      services={categoryServices}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onEdit={onEdit}
      onRenameCategory={onRenameCategory}
      onToggle={toggleCategory}
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
