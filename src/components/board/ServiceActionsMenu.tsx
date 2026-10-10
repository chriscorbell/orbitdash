import { ServiceLinkItems } from "@/components/services/ServiceLinkItems";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LinkTarget } from "@/lib/link-target";
import { cn } from "@/lib/utils";
import type { Service } from "@shared/types";
import { Copy, EllipsisVertical, Pencil, Trash2 } from "lucide-react";

interface ServiceActionsMenuProps {
  className?: string;
  linkTarget: LinkTarget;
  service: Service;
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
  onEdit: (service: Service) => void;
}

/** Edit, duplicate and delete for one card in edit mode, and its links, since the card can't open. */
export function ServiceActionsMenu({
  className,
  linkTarget,
  service,
  onDelete,
  onDuplicate,
  onEdit,
}: ServiceActionsMenuProps) {
  return (
    // Non-modal on purpose: a modal menu that opens the edit dialog left pointer events locked.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${service.name}`}
          className={cn(
            "absolute rounded-lg bg-background/70 backdrop-blur-sm transition-colors hover:!bg-foreground/15 hover:text-foreground pointer-coarse:size-8",
            className
          )}
          // Keep presses on the menu from starting a drag of the card underneath.
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={12} className="w-64">
        <DropdownMenuItem onSelect={() => onEdit(service)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(service)}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ServiceLinkItems includeMain linkTarget={linkTarget} service={service} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(service)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
