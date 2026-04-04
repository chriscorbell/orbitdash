import { IconButton } from "@/components/common/IconButton";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

interface ServicesToolbarProps {
    search: string;
    servicesCount: number;
    onAddService: () => void;
    onSearchChange: (value: string) => void;
}

export function ServicesToolbar({
    search,
    servicesCount,
    onAddService,
    onSearchChange,
}: ServicesToolbarProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Services</h2>
            <div className="flex flex-wrap items-center gap-2">
                {servicesCount > 0 && (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search services…"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-8 w-48 pl-8 text-sm"
                        />
                    </div>
                )}
                <IconButton
                    size="icon-sm"
                    onClick={onAddService}
                    tooltip="Add service"
                    aria-label="Add service"
                >
                    <Plus />
                </IconButton>
            </div>
        </div>
    );
}
