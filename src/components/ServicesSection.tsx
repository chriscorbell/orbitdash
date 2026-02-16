import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceCard } from "@/components/ServiceCard";
import { ServiceDialog } from "@/components/ServiceDialog";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@/shared/types";
import { LayoutGrid, LayoutPanelTop, Plus, Search } from "lucide-react";

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
    const [isFourColumn, setIsFourColumn] = useState(false);
    const editCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gridStorageKey = "orbitdash.servicesGrid";

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(gridStorageKey);
            if (saved === "4") {
                setIsFourColumn(true);
            }
        } catch {
            // Ignore storage access issues.
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(gridStorageKey, isFourColumn ? "4" : "3");
        } catch {
            // Ignore storage access issues.
        }
    }, [isFourColumn]);

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

    // Group by category
    const grouped = useMemo(() => {
        const groups = new Map<string, Service[]>();
        for (const s of filtered) {
            const cat = s.category || "Uncategorized";
            const list = groups.get(cat) || [];
            list.push(s);
            groups.set(cat, list);
        }
        // Sort: named categories first, Uncategorized last
        const entries = [...groups.entries()].sort((a, b) => {
            if (a[0] === "Uncategorized") return 1;
            if (b[0] === "Uncategorized") return -1;
            return a[0].localeCompare(b[0]);
        });
        return entries;
    }, [filtered]);

    const hasCategories = useMemo(
        () => services.some((s) => s.category),
        [services]
    );

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

    const gridClassName = isFourColumn
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">Services</h2>
                <div className="flex items-center gap-2">
                    {services.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search services…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-8 w-48 pl-8 text-sm"
                            />
                        </div>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        className="px-2"
                        onClick={() => setIsFourColumn((prev) => !prev)}
                        aria-label={isFourColumn ? "Switch to 3-column grid" : "Switch to 4-column grid"}
                    >
                        {isFourColumn ? (
                            <LayoutPanelTop className="h-4 w-4" />
                        ) : (
                            <LayoutGrid className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        size="sm"
                        className="px-2"
                        onClick={() => setAddOpen(true)}
                        aria-label="Add service"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {filtered.length === 0 && services.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                        No services added yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Click "Add service" to get started
                    </p>
                </div>
            )}

            {filtered.length === 0 && services.length > 0 && (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8">
                    <p className="text-sm text-muted-foreground">
                        No services match your search
                    </p>
                </div>
            )}

            {hasCategories
                ? grouped.map(([category, categoryServices]) => (
                    <div key={category} className="space-y-3">
                        <h3 className="text-sm font-semibold text-muted-foreground">
                            {category}
                        </h3>
                        <div className={gridClassName}>
                            {categoryServices.map((s) => (
                                <ServiceCard
                                    key={s.id}
                                    service={s}
                                    onEdit={() => {
                                        if (editCloseTimerRef.current) {
                                            clearTimeout(editCloseTimerRef.current);
                                        }
                                        setEditService(s);
                                        setEditOpen(true);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                ))
                : filtered.length > 0 && (
                    <div className={gridClassName}>
                        {filtered.map((s) => (
                            <ServiceCard
                                key={s.id}
                                service={s}
                                onEdit={() => {
                                    if (editCloseTimerRef.current) {
                                        clearTimeout(editCloseTimerRef.current);
                                    }
                                    setEditService(s);
                                    setEditOpen(true);
                                }}
                            />
                        ))}
                    </div>
                )}

            {/* Add dialog */}
            <ServiceDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                onSubmit={async (payload, iconFile) => {
                    await onCreate(payload as CreateServicePayload, iconFile);
                }}
            />

            {/* Edit dialog */}
            {editService && (
                <ServiceDialog
                    open={editOpen}
                    onOpenChange={handleEditOpenChange}
                    service={editService}
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
            )}
        </div>
    );
}
