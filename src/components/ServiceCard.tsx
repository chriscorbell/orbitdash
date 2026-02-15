import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Service } from "@/shared/types";
import { getIconUrl } from "@/lib/api";
import { Pencil, Globe } from "lucide-react";

interface ServiceCardProps {
    service: Service;
    onEdit: (service: Service) => void;
}

export function ServiceCard({ service, onEdit }: ServiceCardProps) {
    const hasDescription = Boolean(service.description?.trim());

    return (
        <div className="group relative">
            <a
                href={service.url}
                target={service.open_in_new_tab ? "_blank" : "_self"}
                rel={service.open_in_new_tab ? "noopener noreferrer" : undefined}
                className="block"
            >
                <Card className="h-full cursor-pointer gap-0 py-0 transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-accent/50 group-hover:shadow-md">
                    <CardContent className="flex items-center gap-2.5 px-4 py-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                            {service.icon ? (
                                <img
                                    src={getIconUrl(service.icon, service.updated_at)}
                                    alt={service.name}
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <Globe className="h-4.5 w-4.5 text-muted-foreground" />
                            )}
                        </div>
                        <div
                            className={`min-w-0 flex-1 ${hasDescription ? "" : "flex items-center"}`}
                        >
                            <div>
                                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                                    {service.name}
                                </p>
                                {hasDescription && (
                                    <p className="line-clamp-1 text-xs leading-tight text-muted-foreground">
                                        {service.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </a>
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1.5 h-6 w-6 opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:-translate-y-0.5"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(service);
                }}
            >
                <Pencil className="h-3 w-3" />
            </Button>
        </div>
    );
}
