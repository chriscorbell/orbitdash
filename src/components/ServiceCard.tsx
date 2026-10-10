import { lazy, memo, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { getIconUrl } from "@/lib/api/services";
import { serviceHref, type LinkTarget } from "@/lib/link-target";
import { cn } from "@/lib/utils";
import type { CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";

// Status checks load on demand: only cards with checks on fetch this, so the first paint of a
// dashboard without checks doesn't grow.
const loadServiceStatus = () => import("@/components/status/ServiceStatus");
const ServiceStatusIndicator = lazy(() =>
  loadServiceStatus().then((module) => ({ default: module.ServiceStatusIndicator }))
);
const ServiceStatusTooltip = lazy(() =>
  loadServiceStatus().then((module) => ({ default: module.ServiceStatusTooltip }))
);
// The same for the menu of cards with named links or a second URL.
const ServiceLinksMenu = lazy(() =>
  import("@/components/services/ServiceLinksMenu").then((module) => ({
    default: module.ServiceLinksMenu,
  }))
);

const DENSITY_STYLES: Record<
  CardDensity,
  { card: string; content: string; icon: string; name: string }
> = {
  compact: {
    card: "rounded-lg",
    content: "flex items-center gap-2.5 px-3 py-2",
    icon: "h-5 w-5",
    name: "text-sm font-medium",
  },
  comfortable: {
    card: "",
    content: "flex items-center gap-2.5 px-4 py-2",
    icon: "h-8 w-8",
    name: "text-sm font-semibold",
  },
  tiles: {
    card: "",
    content: "flex flex-col items-center gap-2 px-2.5 pb-3 pt-4 text-center",
    icon: "h-10 w-10",
    name: "w-full text-xs font-medium",
  },
};

/** Hover hint for what a density hides: the description, and in tiles also the (truncated) name. */
function cardHint(name: string, description: string | null, density: CardDensity) {
  if (density === "tiles") return description ? `${name}\n${description}` : name;
  if (density === "compact") return description ?? undefined;
  return undefined;
}

/** The status dot, keeping its space while the status code loads so nothing shifts. */
function StatusSlot({ density, serviceId }: { density: CardDensity; serviceId: string }) {
  return (
    <Suspense
      fallback={
        <span aria-hidden="true" className={density === "tiles" ? "size-2.5" : "size-2 shrink-0"} />
      }
    >
      <ServiceStatusIndicator density={density} serviceId={serviceId} />
    </Suspense>
  );
}

interface ServiceCardFaceProps {
  className?: string;
  density?: CardDensity;
  service: Service;
  /** Classes for the status dot beside the name (not the tiles badge). */
  statusClassName?: string;
}

/** What a service card looks like, without the link; edit mode wraps it in a drag handle. */
export const ServiceCardFace = memo(function ServiceCardFace({
  className,
  density = "comfortable",
  service,
  statusClassName,
}: ServiceCardFaceProps) {
  const description = service.description?.trim() || null;
  const showDescription = density === "comfortable" && description !== null;
  const styles = DENSITY_STYLES[density];
  const icon = (
    <ServiceIcon
      className={styles.icon}
      name={service.name}
      src={service.icon ? getIconUrl(service.icon, service.updated_at) : null}
    />
  );
  const status = service.check_enabled ? (
    <StatusSlot density={density} serviceId={service.id} />
  ) : null;

  return (
    <Card
      className={cn(
        "h-full gap-0 py-0 transition-[translate,background-color,box-shadow,scale] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-accent/50 group-hover:shadow-md group-active:translate-y-0 group-active:scale-[0.99] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
        styles.card,
        className
      )}
    >
      <CardContent className={styles.content}>
        {density === "tiles" && status ? (
          // In tiles the dot sits on the icon's corner, like a presence badge.
          <div className="relative">
            {icon}
            <span className="absolute -right-1 -bottom-1 flex">{status}</span>
          </div>
        ) : (
          icon
        )}
        <div className={`min-w-0 ${density === "tiles" ? "w-full" : "flex-1"}`}>
          <p className={`truncate leading-tight text-foreground ${styles.name}`}>{service.name}</p>
          {showDescription && (
            <p className="truncate text-xs leading-tight text-muted-foreground">{description}</p>
          )}
        </div>
        {density !== "tiles" &&
          status &&
          (statusClassName ? (
            <span className={cn("flex shrink-0", statusClassName)}>{status}</span>
          ) : (
            status
          ))}
      </CardContent>
    </Card>
  );
});

interface ServiceCardProps {
  service: Service;
  density?: CardDensity;
  linkTarget?: LinkTarget;
}

function ServiceCardView({
  service,
  density = "comfortable",
  linkTarget = "internal",
}: ServiceCardProps) {
  const safeUrl = normalizeServiceUrl(serviceHref(service, linkTarget));
  // Named links and a second URL go in a menu beside the link, since a link can't hold a button.
  const hasMenu = service.links.length > 0 || service.external_url !== null;
  // The menu takes the status dot's place while it shows; touch screens show both side by side.
  const sideMenu = hasMenu && density !== "tiles";

  // The status details repeat the hint, so a card with checks drops the native title.
  const renderLink = (withHint: boolean) => (
    <a
      data-flip-key={hasMenu ? undefined : service.id}
      href={safeUrl || "#"}
      target={service.open_in_new_tab ? "_blank" : "_self"}
      rel={service.open_in_new_tab ? "noopener noreferrer" : undefined}
      title={
        withHint ? cardHint(service.name, service.description?.trim() || null, density) : undefined
      }
      className={cn(
        "block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        hasMenu ? "h-full" : "group"
      )}
      aria-disabled={!safeUrl}
      onClick={(event) => {
        if (!safeUrl) {
          event.preventDefault();
        }
      }}
    >
      <ServiceCardFace
        service={service}
        density={density}
        className={sideMenu ? "pointer-coarse:pr-6" : undefined}
        statusClassName={
          sideMenu
            ? "transition-opacity group-hover:opacity-0 group-has-focus-visible:opacity-0"
            : undefined
        }
      />
    </a>
  );

  const card = service.check_enabled ? (
    <Suspense fallback={renderLink(true)}>
      <ServiceStatusTooltip density={density} service={service}>
        {renderLink(false)}
      </ServiceStatusTooltip>
    </Suspense>
  ) : (
    renderLink(true)
  );

  if (!hasMenu) {
    return card;
  }

  return (
    <div data-flip-key={service.id} className="group relative">
      {card}
      <Suspense fallback={null}>
        <ServiceLinksMenu density={density} linkTarget={linkTarget} service={service} />
      </Suspense>
    </div>
  );
}

/** A service as a plain link. Memoized so unrelated dashboard updates never re-render every card. */
export const ServiceCard = memo(ServiceCardView);
