import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { serviceHref, type LinkTarget } from "@/lib/link-target";
import { hostOf } from "@/lib/palette";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { ArrowUpRight, Globe, House, SquareArrowOutUpRight, type LucideIcon } from "lucide-react";

interface LinkItemProps {
  icon: LucideIcon;
  label: string;
  newTab: boolean;
  url: string;
}

/** A real link in the menu, so it can also be middle-clicked or copied. */
function LinkItem({ icon: Icon, label, newTab, url }: LinkItemProps) {
  const href = normalizeServiceUrl(url);

  return (
    <DropdownMenuItem asChild disabled={!href}>
      <a
        href={href ?? undefined}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="min-w-0 truncate">{label}</span>
        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
          {hostOf(url)}
        </span>
      </a>
    </DropdownMenuItem>
  );
}

interface ServiceLinkItemsProps {
  /** Edit mode lists the card's own link too, since there the card opens the editor. */
  includeMain?: boolean;
  linkTarget: LinkTarget;
  service: Service;
}

/**
 * A service's links for a dropdown menu: its own link (when asked), the URL the card isn't using
 * when it has both, and its named links. Renders nothing when there are none.
 */
export function ServiceLinkItems({
  includeMain = false,
  linkTarget,
  service,
}: ServiceLinkItemsProps) {
  const newTab = service.open_in_new_tab;
  const external = service.external_url;
  const alternate =
    external === null
      ? null
      : linkTarget === "external"
        ? { icon: House, label: "Internal URL", url: service.url }
        : { icon: Globe, label: "External URL", url: external };

  return (
    <>
      {includeMain && (
        <LinkItem
          icon={SquareArrowOutUpRight}
          label="Open"
          newTab={newTab}
          url={serviceHref(service, linkTarget)}
        />
      )}
      {alternate && <LinkItem {...alternate} newTab={newTab} />}
      {service.links.length > 0 && (includeMain || alternate) && <DropdownMenuSeparator />}
      {service.links.map((link, index) => (
        <LinkItem
          key={`${index}:${link.url}`}
          icon={ArrowUpRight}
          label={link.label}
          newTab={newTab}
          url={link.url}
        />
      ))}
    </>
  );
}
