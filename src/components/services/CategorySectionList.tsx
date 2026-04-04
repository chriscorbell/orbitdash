import { ServiceCard } from "@/components/ServiceCard";
import type { Service } from "@shared/types";

interface CategorySectionListProps {
    grouped: ReadonlyArray<readonly [string, Service[]]>;
    gridClassName: string;
    hasNamedCategories: boolean;
    services: Service[];
    onDelete: (service: Service) => void;
    onEdit: (service: Service) => void;
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
        return grouped.map(([category, categoryServices]) => (
            <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                    {category}
                </h3>
                <div className={gridClassName}>
                    {categoryServices.map((service) => (
                        <ServiceCard
                            key={service.id}
                            service={service}
                            onDelete={onDelete}
                            onEdit={onEdit}
                        />
                    ))}
                </div>
            </div>
        ));
    }

    return (
        <div className={gridClassName}>
            {services.map((service) => (
                <ServiceCard
                    key={service.id}
                    service={service}
                    onDelete={onDelete}
                    onEdit={onEdit}
                />
            ))}
        </div>
    );
}
