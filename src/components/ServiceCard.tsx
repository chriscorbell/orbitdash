import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { getIconUrl } from "@/lib/api/services";
import type { CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { Copy, EllipsisVertical, Pencil, Trash2 } from "lucide-react";

interface ServiceCardProps {
  service: Service;
  density?: CardDensity;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
}

const DENSITY_STYLES: Record<
  CardDensity,
  { card: string; content: string; icon: string; name: string; menu: string }
> = {
  compact: {
    card: "rounded-lg",
    content: "flex items-center gap-2.5 px-3 py-2",
    icon: "h-5 w-5",
    name: "text-sm font-medium",
    menu: "right-1.5 top-1/2 -translate-y-1/2",
  },
  comfortable: {
    card: "",
    content: "flex items-center gap-2.5 px-4 py-2",
    icon: "h-8 w-8",
    name: "text-sm font-semibold",
    menu: "right-1.5 top-1.5",
  },
  tiles: {
    card: "",
    content: "flex flex-col items-center gap-2 px-2.5 pb-3 pt-4 text-center",
    icon: "h-10 w-10",
    name: "w-full text-xs font-medium",
    menu: "right-1 top-1",
  },
};

/** Hover hint for what a density hides: the description, and in tiles also the (truncated) name. */
function cardHint(name: string, description: string | null, density: CardDensity) {
  if (density === "tiles") return description ? `${name}\n${description}` : name;
  if (density === "compact") return description ?? undefined;
  return undefined;
}

function ServiceCardView({
  service,
  density = "comfortable",
  onEdit,
  onDelete,
  onDuplicate,
}: ServiceCardProps) {
  const description = service.description?.trim() || null;
  const showDescription = density === "comfortable" && description !== null;
  const safeUrl = normalizeServiceUrl(service.url);
  const styles = DENSITY_STYLES[density];

  return (
    <div className="group relative">
      <a
        href={safeUrl || "#"}
        target={service.open_in_new_tab ? "_blank" : "_self"}
        rel={service.open_in_new_tab ? "noopener noreferrer" : undefined}
        title={cardHint(service.name, description, density)}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-disabled={!safeUrl}
        onClick={(e) => {
          if (!safeUrl) {
            e.preventDefault();
          }
        }}
      >
        <Card
          className={`h-full cursor-pointer gap-0 py-0 transition-[translate,background-color,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-accent/50 group-hover:shadow-md group-active:translate-y-0 group-active:scale-[0.99] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 ${styles.card}`}
        >
          <CardContent className={styles.content}>
            <ServiceIcon
              className={styles.icon}
              name={service.name}
              src={service.icon ? getIconUrl(service.icon, service.updated_at) : null}
            />
            <div className={`min-w-0 ${density === "tiles" ? "w-full" : "flex-1 pr-5"}`}>
              <p className={`truncate leading-tight text-foreground ${styles.name}`}>
                {service.name}
              </p>
              {showDescription && (
                <p className="truncate text-xs leading-tight text-muted-foreground">
                  {description}
                </p>
              )}
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
            className={`service-card-menu-trigger absolute rounded-lg ${styles.menu} transition-all duration-200 ease-out hover:!bg-foreground/15 hover:text-foreground`}
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
          <DropdownMenuItem
            onSelect={() => {
              onDuplicate(service);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
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

/** Memoized so unrelated dashboard updates never re-render every card. */
export const ServiceCard = memo(ServiceCardView);
