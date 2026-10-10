import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { getIconUrl } from "@/lib/api/services";
import { cn } from "@/lib/utils";
import type { CardDensity } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";

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

interface ServiceCardFaceProps {
  className?: string;
  density?: CardDensity;
  service: Service;
}

/** What a service card looks like, without the link; edit mode wraps it in a drag handle. */
export const ServiceCardFace = memo(function ServiceCardFace({
  className,
  density = "comfortable",
  service,
}: ServiceCardFaceProps) {
  const description = service.description?.trim() || null;
  const showDescription = density === "comfortable" && description !== null;
  const styles = DENSITY_STYLES[density];

  return (
    <Card
      className={cn(
        "h-full gap-0 py-0 transition-[translate,background-color,box-shadow,scale] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:bg-accent/50 group-hover:shadow-md group-active:translate-y-0 group-active:scale-[0.99] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
        styles.card,
        className
      )}
    >
      <CardContent className={styles.content}>
        <ServiceIcon
          className={styles.icon}
          name={service.name}
          src={service.icon ? getIconUrl(service.icon, service.updated_at) : null}
        />
        <div className={`min-w-0 ${density === "tiles" ? "w-full" : "flex-1"}`}>
          <p className={`truncate leading-tight text-foreground ${styles.name}`}>{service.name}</p>
          {showDescription && (
            <p className="truncate text-xs leading-tight text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

interface ServiceCardProps {
  service: Service;
  density?: CardDensity;
}

function ServiceCardView({ service, density = "comfortable" }: ServiceCardProps) {
  const safeUrl = normalizeServiceUrl(service.url);

  return (
    <a
      href={safeUrl || "#"}
      target={service.open_in_new_tab ? "_blank" : "_self"}
      rel={service.open_in_new_tab ? "noopener noreferrer" : undefined}
      title={cardHint(service.name, service.description?.trim() || null, density)}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-disabled={!safeUrl}
      onClick={(event) => {
        if (!safeUrl) {
          event.preventDefault();
        }
      }}
    >
      <ServiceCardFace service={service} density={density} />
    </a>
  );
}

/** A service as a plain link. Memoized so unrelated dashboard updates never re-render every card. */
export const ServiceCard = memo(ServiceCardView);
