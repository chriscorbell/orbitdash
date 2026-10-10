import { useEffect, useRef, useState, type ReactElement } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import {
  describeProblem,
  describeSince,
  formatLatency,
  formatUptimePercent,
  STATUS_LABEL,
} from "@/components/status/status-format";
import { useServiceStatus, useStatusHistory } from "@/components/status/useServiceStatus";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { EventStream } from "@/lib/live/event-stream";
import { cn } from "@/lib/utils";
import type { CardDensity } from "@shared/dashboard-settings";
import { bucketState, type StatusBucketState } from "@shared/status";
import type { Service, ServiceStatus, ServiceStatusState } from "@shared/types";

/**
 * Everything a card shows about its status check. This module loads on demand, the first time a
 * card with checks on renders, so dashboards without checks never download it.
 */

const DOT_COLOR: Record<ServiceStatusState, string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted-foreground/45",
};

const SEGMENT_COLOR: Record<StatusBucketState, string> = {
  up: "bg-success/75",
  degraded: "bg-warning/85",
  down: "bg-destructive/85",
  none: "bg-muted-foreground/15",
};

const HISTORY_SEGMENTS = 48;

const hasLatency = (
  status: ServiceStatus | null | undefined
): status is ServiceStatus & { latencyMs: number } =>
  !!status && (status.state === "up" || status.state === "degraded") && status.latencyMs !== null;

/**
 * A colored dot. It fades in when it first appears; a change of state pops it and sends out one
 * ring, so a service going down (or coming back) is noticed without anything blinking for long.
 */
function StatusDot({ state, className }: { className?: string; state: ServiceStatusState }) {
  const dotRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(state);

  useEffect(() => {
    if (previous.current === state) return;
    previous.current = state;
    if (prefersReducedMotion()) return;
    dotRef.current?.animate?.(
      [
        { transform: "scale(0.4)", opacity: 0.5 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    ringRef.current?.animate?.(
      [
        { transform: "scale(1)", opacity: 0.6 },
        { transform: "scale(2.8)", opacity: 0 },
      ],
      { duration: 900, easing: "cubic-bezier(0, 0, 0.2, 1)" }
    );
  }, [state]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-2 shrink-0 animate-in fade-in-0 duration-300 motion-reduce:animate-none",
        className
      )}
    >
      <span
        ref={ringRef}
        className={cn("absolute inset-0 rounded-full opacity-0", DOT_COLOR[state])}
      />
      <span
        ref={dotRef}
        data-status={state}
        className={cn("relative size-full rounded-full", DOT_COLOR[state])}
      />
    </span>
  );
}

interface ServiceStatusIndicatorProps {
  density: CardDensity;
  serviceId: string;
  stream?: EventStream;
}

/** The dot on a card, with the response time beside it where there is room. */
export function ServiceStatusIndicator({
  density,
  serviceId,
  stream,
}: ServiceStatusIndicatorProps) {
  const status = useServiceStatus(serviceId, stream);
  const state = status?.state ?? "unknown";

  // Holds the dot's place until the statuses load, so the first one fades in rather than popping.
  if (status === undefined) {
    return (
      <span aria-hidden="true" className={density === "tiles" ? "size-2.5" : "size-2 shrink-0"} />
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {density === "comfortable" && hasLatency(status) && (
        // Phones show two cards per row, where the name needs the room more.
        <span
          aria-hidden="true"
          className="font-mono text-[11px] leading-none tabular-nums text-muted-foreground max-sm:hidden"
        >
          {formatLatency(status.latencyMs)}
        </span>
      )}
      <StatusDot
        state={state}
        className={density === "tiles" ? "size-2.5 rounded-full ring-2 ring-card" : undefined}
      />
      <span className="sr-only">{STATUS_LABEL[state]}</span>
    </span>
  );
}

function UptimeBar({ serviceId }: { serviceId: string }) {
  const { data, isError, isPending } = useStatusHistory(serviceId);
  const buckets = data?.buckets ?? [];
  const uptime = data?.uptime ?? null;
  const summary = isError
    ? "History unavailable"
    : uptime !== null
      ? `${formatUptimePercent(uptime)} up`
      : isPending
        ? ""
        : "No checks yet";

  return (
    <div className="space-y-1.5">
      <div
        role="img"
        aria-label={
          uptime === null
            ? "No uptime history yet"
            : `${formatUptimePercent(uptime)} up in 24 hours`
        }
        className="flex h-5 items-stretch gap-px"
      >
        {isPending
          ? Array.from({ length: HISTORY_SEGMENTS }, (_, index) => (
              <span
                key={index}
                className="flex-1 animate-pulse rounded-[2px] bg-muted-foreground/15 motion-reduce:animate-none"
              />
            ))
          : buckets.map((bucket) => (
              <span
                key={bucket.ts}
                data-bucket={bucketState(bucket)}
                className={cn(
                  "flex-1 rounded-[2px] animate-in fade-in-0 duration-300 motion-reduce:animate-none",
                  SEGMENT_COLOR[bucketState(bucket)]
                )}
              />
            ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>24h</span>
        <span>{summary}</span>
      </div>
    </div>
  );
}

interface StatusDetailsProps {
  density: CardDensity;
  now: number;
  service: Service;
  status: ServiceStatus | null;
}

function StatusDetails({ density, now, service, status }: StatusDetailsProps) {
  const state = status?.state ?? "unknown";
  // Whatever the card's density hides: the (truncated) name in tiles, the description in both.
  const name = density === "tiles" ? service.name : null;
  const description = density === "comfortable" ? null : service.description?.trim() || null;
  const since = status ? describeSince(status, now) : null;
  const problem = status ? describeProblem(status) : null;

  return (
    <div className="space-y-2.5">
      {(name || description) && (
        <div className="space-y-0.5 border-b pb-2.5">
          {name && <p className="text-sm leading-tight font-semibold">{name}</p>}
          {description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <StatusDot state={state} />
          <span className="text-sm font-medium">{STATUS_LABEL[state]}</span>
          {hasLatency(status) && (
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              {formatLatency(status.latencyMs)}
            </span>
          )}
        </div>
        {since && <p className="text-xs text-muted-foreground">{since}</p>}
        {problem && (
          <p
            className={cn(
              "text-xs",
              state === "down" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {problem}
          </p>
        )}
      </div>
      <UptimeBar serviceId={service.id} />
    </div>
  );
}

interface ServiceStatusTooltipProps {
  children: ReactElement;
  density: CardDensity;
  service: Service;
  stream?: EventStream;
}

/**
 * Wraps a card's link: hovering or focusing it shows the status, the last change and a 24h uptime
 * bar. The card stays a plain link; this only adds a description to it.
 */
export function ServiceStatusTooltip({
  children,
  density,
  service,
  stream,
}: ServiceStatusTooltipProps) {
  const status = useServiceStatus(service.id, stream) ?? null;
  // "Up for 3h" is worked out when the details open; the content only renders while open.
  const [openedAt, setOpenedAt] = useState(0);
  const state = status?.state ?? "unknown";
  const label = [
    STATUS_LABEL[state],
    hasLatency(status) ? formatLatency(status.latencyMs) : null,
    status ? describeSince(status, openedAt) : null,
    status ? describeProblem(status) : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>
      <TooltipPrimitive.Root
        onOpenChange={(open) => {
          if (open) setOpenedAt(Date.now());
        }}
      >
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            aria-label={label}
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-64 origin-(--radix-tooltip-content-transform-origin) rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none"
          >
            <StatusDetails density={density} now={openedAt} service={service} status={status} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
