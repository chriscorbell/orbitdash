import { useQuery } from "@tanstack/react-query";
import { Container } from "lucide-react";
import { fetchDocker } from "@/lib/api/docker";
import { summarizeContainers } from "@/lib/containers";
import { handleLinkClick } from "@/lib/router";
import { cn } from "@/lib/utils";

/** Whether orbitdash reaches Docker, and what to set when it doesn't. */
export function DockerSection({ showStatsPage }: { showStatsPage: boolean }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["docker"],
    queryFn: fetchDocker,
    staleTime: 30_000,
  });
  const summary = data?.available ? summarizeContainers(data.containers) : null;
  const state = isPending
    ? "Checking…"
    : summary
      ? `Connected · ${summary.running} of ${summary.total} containers running`
      : data?.configured
        ? (data.error ?? "Docker can't be reached")
        : "Not set up";

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <Container aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">Docker</p>
          <p
            className={cn(
              "text-sm",
              summary
                ? "text-muted-foreground"
                : data?.configured
                  ? "text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {error ? error.message : state}
          </p>
        </div>
        {summary && showStatsPage && (
          <a
            href="/stats#containers"
            onClick={(event) => handleLinkClick(event, "/stats#containers")}
            className="shrink-0 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Containers
          </a>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        orbitdash reads containers through <code>ORBITDASH_DOCKER_HOST</code>, ideally a read-only
        docker-socket-proxy (<code>tcp://dockerproxy:2375</code>), or a socket mounted at{" "}
        <code>/var/run/docker.sock</code>. It only ever reads. Linking a container to a service
        happens in the service&apos;s Integration settings.
      </p>
    </>
  );
}
