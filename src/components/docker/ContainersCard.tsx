import { useState } from "react";
import { ArrowDown, Container } from "lucide-react";
import { useDocker } from "@/hooks/useDocker";
import { formatBytes } from "@/lib/format";
import {
  containerTone,
  describeSummary,
  portUrl,
  sortContainers,
  summarizeContainers,
  type ContainerSort,
  type ContainerTone,
} from "@/lib/containers";
import { cn } from "@/lib/utils";
import type { ContainerInfo } from "@shared/types";

const DOT: Record<ContainerTone, string> = {
  up: "bg-success",
  warning: "bg-warning",
  down: "bg-destructive",
  idle: "bg-muted-foreground/40",
};

const SORTS: Array<{ value: ContainerSort; label: string }> = [
  { value: "name", label: "Name" },
  { value: "cpu", label: "CPU" },
  { value: "memory", label: "Memory" },
];

/** Every container with its state, health, resources and published ports, for the Stats page. */
export function ContainersCard() {
  const { data, error } = useDocker();
  const [sort, setSort] = useState<ContainerSort>("name");
  if (!data?.configured && !error) return null;

  const summary = data?.available ? summarizeContainers(data.containers) : null;
  const note = summary ? describeSummary(summary) : null;

  return (
    <section
      id="containers"
      aria-label="Containers"
      className="scroll-mt-20 space-y-3 rounded-xl border bg-card p-4 shadow-xs"
      ref={(node) => {
        if (node && window.location.hash === "#containers") node.scrollIntoView({ block: "start" });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Container aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          Containers
          {summary && (
            <span className="font-normal text-muted-foreground">
              {summary.running} of {summary.total} running{note ? ` · ${note}` : ""}
            </span>
          )}
        </h2>
        {summary && summary.total > 1 && (
          <div role="group" aria-label="Sort containers" className="flex gap-1 text-xs">
            {SORTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sort === option.value}
                onClick={() => setSort(option.value)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  sort === option.value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
                {sort === option.value && option.value !== "name" && (
                  <ArrowDown aria-hidden="true" className="h-3 w-3" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data?.available ? (
        <p className="text-sm text-muted-foreground">
          {data?.error ?? error?.message ?? "Docker can't be reached"}
        </p>
      ) : data.containers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No containers.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sortContainers(data.containers, sort).map((container) => (
            <ContainerRow key={container.id} container={container} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ContainerRow({ container }: { container: ContainerInfo }) {
  const tone = containerTone(container);
  const running = container.state === "running";
  const memory = container.memoryBytes !== null ? formatBytes(container.memoryBytes) : null;

  const cpu = running && container.cpuPercent !== null ? `${container.cpuPercent.toFixed(1)}%` : "";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-2 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_5.5rem]">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 shrink-0 rounded-full transition-colors", DOT[tone])}
        />
        <span className="min-w-0">
          <span className="block truncate font-medium" title={container.name}>
            {container.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={container.image}>
            {container.composeProject ? `${container.composeProject} · ` : ""}
            {container.image}
          </span>
        </span>
      </div>
      {/* Phones put CPU beside the name and the status underneath; wider screens use columns. */}
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground sm:hidden">
        {cpu}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-4 text-xs text-muted-foreground sm:pl-0">
        <span className={cn("truncate", tone === "down" && "text-destructive")}>
          {container.status || container.state}
        </span>
        {container.ports.map((port) => {
          const href = portUrl(port, window.location);
          const label = `${port.publicPort}${port.protocol === "tcp" ? "" : `/${port.protocol}`}`;
          return href && running ? (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-1 font-mono transition-colors hover:border-brand/50 hover:text-foreground"
            >
              {label}
            </a>
          ) : (
            <span key={label} className="rounded border px-1 font-mono">
              {label}
            </span>
          );
        })}
      </div>
      <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {cpu}
      </span>
      <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {running && memory ? memory : ""}
      </span>
    </li>
  );
}
