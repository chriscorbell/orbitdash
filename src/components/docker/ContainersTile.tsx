import { Container } from "lucide-react";
import { useDocker } from "@/hooks/useDocker";
import { describeSummary, summarizeContainers } from "@/lib/containers";
import { handleLinkClick } from "@/lib/router";
import { cn } from "@/lib/utils";

/** Containers at a glance in the stats strip; opens the list on the Stats page when it's on. */
export function ContainersTile({ linkToStats }: { linkToStats: boolean }) {
  const { data } = useDocker();
  const summary = data?.available ? summarizeContainers(data.containers) : null;
  const note = summary ? describeSummary(summary) : (data?.error ?? null);
  const tone = !summary
    ? "text-muted-foreground"
    : summary.unhealthy
      ? "text-destructive"
      : summary.other
        ? "text-warning"
        : "text-brand";

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Container aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Containers</span>
      </span>
      <div className="mt-1 flex min-w-0 items-end gap-3">
        <span
          className={cn(
            "shrink-0 font-mono text-lg leading-none font-semibold tabular-nums transition-colors sm:text-xl",
            tone
          )}
          aria-label={
            summary
              ? `${summary.running} of ${summary.total} containers running`
              : "Containers unavailable"
          }
        >
          {summary ? summary.running : "–"}
          {summary && (
            <span className="ml-px text-xs font-medium text-muted-foreground">
              /{summary.total}
            </span>
          )}
        </span>
        <span className="min-w-0 truncate pb-px text-xs text-muted-foreground">
          {note ?? (summary ? "All running" : "")}
        </span>
      </div>
    </>
  );

  const className =
    "block min-w-0 rounded-xl border bg-card px-3 pt-2.5 pb-2 shadow-xs transition-colors animate-in fade-in-0 duration-300 sm:px-3.5";
  return linkToStats ? (
    <a
      href="/stats#containers"
      onClick={(event) => handleLinkClick(event, "/stats#containers")}
      className={cn(
        className,
        "hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
