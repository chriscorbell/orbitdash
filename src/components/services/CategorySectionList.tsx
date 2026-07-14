import { useId } from "react";
import { ServiceCard } from "@/components/ServiceCard";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import type { Service } from "@shared/types";
import { ChevronDown } from "lucide-react";

interface CategorySectionListProps {
  grouped: ReadonlyArray<readonly [string, Service[]]>;
  gridClassName: string;
  hasNamedCategories: boolean;
  services: Service[];
  onDelete: (service: Service) => void;
  onEdit: (service: Service) => void;
}

interface CategorySectionProps {
  category: string;
  collapsed: boolean;
  gridClassName: string;
  services: Service[];
  onDelete: (service: Service) => void;
  onEdit: (service: Service) => void;
  onToggle: (category: string) => void;
}

function CategorySection({
  category,
  collapsed,
  gridClassName,
  services,
  onDelete,
  onEdit,
  onToggle,
}: CategorySectionProps) {
  const contentId = useId();
  const serviceCountLabel = `${services.length} ${services.length === 1 ? "service" : "services"}`;

  return (
    <section className="space-y-3">
      <h3>
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
      <div id={contentId} hidden={collapsed} className={collapsed ? "hidden" : gridClassName}>
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} onDelete={onDelete} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

function CategorizedSectionList({
  grouped,
  gridClassName,
  onDelete,
  onEdit,
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
      onEdit={onEdit}
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
  onEdit,
}: CategorySectionListProps) {
  if (hasNamedCategories) {
    return (
      <CategorizedSectionList
        grouped={grouped}
        gridClassName={gridClassName}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );
  }

  return (
    <div className={gridClassName}>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}
