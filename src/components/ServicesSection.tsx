import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { CategorySectionList } from "@/components/services/CategorySectionList";
import { ServicesEmptyState } from "@/components/services/ServicesEmptyState";
import { ServicesToolbar } from "@/components/services/ServicesToolbar";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { UNCATEGORIZED_CATEGORY } from "@shared/category-order";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";

const ServiceDialog = lazy(() =>
    import("@/components/ServiceDialog").then((module) => ({
        default: module.ServiceDialog,
    }))
);

const CategoryReorderDialog = lazy(() =>
    import("@/components/services/CategoryReorderDialog").then((module) => ({
        default: module.CategoryReorderDialog,
    }))
);

interface ServicesSectionProps {
    services: Service[];
    onCreate: (payload: CreateServicePayload, iconFile?: File) => Promise<Service>;
    onUpdate: (
        id: string,
        payload: UpdateServicePayload,
        iconFile?: File,
        removeIcon?: boolean
    ) => Promise<Service>;
    onDelete: (id: string) => Promise<void>;
}

export function ServicesSection({
    services,
    onCreate,
    onUpdate,
    onDelete,
}: ServicesSectionProps) {
    const [addOpen, setAddOpen] = useState(false);
    const [editService, setEditService] = useState<Service | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [gridColumns, setGridColumns] = useLocalStorageState("orbitdash.servicesGrid", "4");
    const editCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const {
        draftOrder,
        error: categoryOrderError,
        hasNamedCategories,
        isReorderMode,
        loading: isCategoryOrderLoading,
        namedCategories,
        saving: isCategoryOrderSaving,
        visibleCategoryOrder,
        beginReorder,
        cancelReorder,
        moveCategory,
        reorderCategories,
        saveOrder,
    } = useCategoryOrder(services);
    const normalizedGridColumns = gridColumns === "5" ? "5" : "4";
    const isFiveColumn = normalizedGridColumns === "5";

    const filtered = useMemo(() => {
        if (!search.trim()) return services;
        const q = search.toLowerCase();
        return services.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description?.toLowerCase().includes(q) ||
                s.category?.toLowerCase().includes(q) ||
                s.url.toLowerCase().includes(q)
        );
    }, [services, search]);

    const grouped = useMemo(() => {
        const groups = new Map<string, Service[]>();
        for (const s of filtered) {
            const cat = s.category?.trim() || UNCATEGORIZED_CATEGORY;
            const list = groups.get(cat) || [];
            list.push(s);
            groups.set(cat, list);
        }
        return visibleCategoryOrder
            .filter((category) => groups.has(category))
            .map((category) => [category, groups.get(category) ?? []] as const);
    }, [filtered, visibleCategoryOrder]);

    const categoryOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: string[] = [];

        for (const service of services) {
            const category = service.category?.trim();
            if (!category || seen.has(category)) continue;
            seen.add(category);
            options.push(category);
        }

        return options.sort((a, b) => a.localeCompare(b));
    }, [services]);

    const canReorderCategories = namedCategories.length >= 2;
    const handleEdit = (service: Service) => {
        if (editCloseTimerRef.current) {
            clearTimeout(editCloseTimerRef.current);
        }
        setEditService(service);
        setEditOpen(true);
    };
    const handleEditOpenChange = (open: boolean) => {
        setEditOpen(open);
        if (!open) {
            if (editCloseTimerRef.current) {
                clearTimeout(editCloseTimerRef.current);
            }
            editCloseTimerRef.current = setTimeout(() => {
                setEditService(null);
            }, 220);
        }
    };

    const gridClassName = isFiveColumn
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";
    const handleReorderOpenChange = (open: boolean) => {
        if (!open) {
            cancelReorder();
        }
    };

    return (
        <div className="space-y-4">
            <ServicesToolbar
                canReorderCategories={canReorderCategories}
                isCategoryOrderBusy={isCategoryOrderLoading || isCategoryOrderSaving}
                columnCount={isFiveColumn ? 5 : 4}
                isReorderMode={isReorderMode}
                search={search}
                servicesCount={services.length}
                onAddService={() => setAddOpen(true)}
                onSearchChange={setSearch}
                onToggleGrid={() => setGridColumns((prev) => (prev === "5" ? "4" : "5"))}
                onToggleReorder={isReorderMode ? cancelReorder : beginReorder}
            />

            <Suspense fallback={null}>
                <CategoryReorderDialog
                    draftOrder={draftOrder}
                    error={categoryOrderError}
                    open={isReorderMode}
                    saving={isCategoryOrderSaving}
                    onMoveCategory={moveCategory}
                    onOpenChange={handleReorderOpenChange}
                    onReorder={reorderCategories}
                    onSave={() => void saveOrder()}
                />
            </Suspense>

            {filtered.length === 0 && services.length === 0 && (
                <ServicesEmptyState mode="empty" onAddService={() => setAddOpen(true)} />
            )}

            {filtered.length === 0 && services.length > 0 && (
                <ServicesEmptyState
                    mode="search"
                    search={search}
                    onAddService={() => setAddOpen(true)}
                    onClearSearch={() => setSearch("")}
                />
            )}

            {filtered.length > 0 && (
                <CategorySectionList
                    grouped={grouped}
                    gridClassName={gridClassName}
                    hasNamedCategories={hasNamedCategories}
                    services={filtered}
                    onEdit={handleEdit}
                />
            )}

            {/* Add dialog */}
            <Suspense fallback={null}>
                <ServiceDialog
                    open={addOpen}
                    onOpenChange={setAddOpen}
                    categoryOptions={categoryOptions}
                    onSubmit={async (payload, iconFile) => {
                        await onCreate(payload as CreateServicePayload, iconFile);
                    }}
                />
            </Suspense>

            {/* Edit dialog */}
            {editService && (
                <Suspense fallback={null}>
                    <ServiceDialog
                        open={editOpen}
                        onOpenChange={handleEditOpenChange}
                        service={editService}
                        categoryOptions={categoryOptions}
                        onSubmit={async (payload, iconFile, removeIcon) => {
                            await onUpdate(
                                editService.id,
                                payload as UpdateServicePayload,
                                iconFile,
                                removeIcon
                            );
                            handleEditOpenChange(false);
                        }}
                        onDelete={async () => {
                            await onDelete(editService.id);
                            handleEditOpenChange(false);
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}
