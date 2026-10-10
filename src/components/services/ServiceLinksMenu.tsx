import { ServiceLinkItems } from "@/components/services/ServiceLinkItems";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LinkTarget } from "@/lib/link-target";
import { cn } from "@/lib/utils";
import type { CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { EllipsisVertical } from "lucide-react";

const POSITION: Record<CardDensity, string> = {
  compact: "right-1.5 top-1/2 -translate-y-1/2",
  comfortable: "right-1.5 top-1/2 -translate-y-1/2",
  tiles: "right-1 top-1",
};

interface ServiceLinksMenuProps {
  density: CardDensity;
  linkTarget: LinkTarget;
  service: Service;
}

/**
 * The menu beside a card that has named links or a second URL. It appears where the status dot is
 * while the card is hovered or focused (touch screens always show it), and loads on demand, so
 * dashboards without links never download it.
 */
export function ServiceLinksMenu({ density, linkTarget, service }: ServiceLinksMenuProps) {
  return (
    // Non-modal like the edit menu, so leaving it never strands pointer events.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`More links for ${service.name}`}
          className={cn(
            "absolute rounded-lg opacity-0 duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100 motion-reduce:transition-none",
            POSITION[density]
          )}
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={12} className="w-64">
        <ServiceLinkItems linkTarget={linkTarget} service={service} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
