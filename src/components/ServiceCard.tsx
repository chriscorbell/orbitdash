import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getIconUrl } from "@/lib/api/services";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { EllipsisVertical, Globe, Pencil, Trash2 } from "lucide-react";

interface ServiceCardProps {
  service: Service;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
}

export function ServiceCard({ service, onEdit, onDelete }: ServiceCardProps) {
  const hasDescription = Boolean(service.description?.trim());
  const safeUrl = normalizeServiceUrl(service.url);

  return (
    <div className="group relative">
      <a
        href={safeUrl || "#"}
        target={service.open_in_new_tab ? "_blank" : "_self"}
        rel={service.open_in_new_tab ? "noopener noreferrer" : undefined}
        className="block"
        aria-disabled={!safeUrl}
        onClick={(e) => {
          if (!safeUrl) {
            e.preventDefault();
          }
        }}
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
            <div className={`min-w-0 flex-1 ${hasDescription ? "" : "flex items-center"}`}>
              <div>
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {service.name}
                </p>
                {hasDescription && (
                  <p className="truncate text-xs leading-tight text-muted-foreground">
                    {service.description}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </a>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${service.name}`}
            className="service-card-menu-trigger absolute right-1.5 top-1.5 rounded-lg transition-all duration-200 ease-out hover:!bg-foreground/15 hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <EllipsisVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onSelect={() => {
              onEdit(service);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              onDelete(service);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
