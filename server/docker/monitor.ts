import type { ContainerInfo, DockerSnapshot } from "@shared/types";
import { publish } from "../events";
import { writeLog } from "../observability";
import {
  createDockerClient,
  DockerError,
  resolveDockerEndpoint,
  type DockerClient,
  type DockerEndpoint,
} from "./client";
import {
  cpuPercent,
  discoveryLabels,
  parseContainer,
  parseStats,
  type CpuSample,
} from "./containers";

const LIST_INTERVAL_MS = 30_000;
const STATS_INTERVAL_MS = 15_000;
const STATS_CONCURRENCY = 4;
/** Docker sends several events per change (die, stop, destroy); one refresh covers them. */
const EVENT_DEBOUNCE_MS = 400;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CONTAINER_EVENTS = new Set([
  "create",
  "start",
  "stop",
  "die",
  "kill",
  "destroy",
  "pause",
  "unpause",
  "restart",
  "rename",
  "health_status",
]);

export interface DockerMonitorDependencies {
  endpoint: DockerEndpoint | null;
  client?: DockerClient;
  now?: () => number;
  onChange?: (snapshot: DockerSnapshot) => void;
}

type Stats = Pick<ContainerInfo, "cpuPercent" | "memoryBytes" | "memoryLimitBytes">;

/**
 * Keeps a list of containers current: a full list every 30 s and right after Docker reports a
 * change on its event stream, and CPU and memory for running containers every 15 s. Only reads.
 */
export function createDockerMonitor({
  endpoint,
  client = endpoint ? createDockerClient(endpoint) : undefined,
  now = () => Date.now(),
  onChange = (snapshot) => publish({ type: "containers", snapshot }),
}: DockerMonitorDependencies) {
  let snapshot: DockerSnapshot = {
    configured: endpoint !== null,
    available: false,
    error: endpoint ? null : "Docker isn't set up",
    containers: [],
    updatedAt: null,
  };
  const stats = new Map<string, Stats>();
  const labels = new Map<string, Record<string, string>>();
  const cpuSamples = new Map<string, CpuSample>();
  let running = false;
  let lifecycle = new AbortController();
  const timers: Array<ReturnType<typeof setInterval>> = [];
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let refreshing: Promise<void> | null = null;

  function update(next: Omit<DockerSnapshot, "configured">) {
    const merged: DockerSnapshot = { configured: endpoint !== null, ...next };
    const changed =
      JSON.stringify({ ...merged, updatedAt: 0 }) !== JSON.stringify({ ...snapshot, updatedAt: 0 });
    snapshot = merged;
    if (changed) onChange(snapshot);
  }

  function withStats(containers: Array<Omit<ContainerInfo, keyof Stats>>): ContainerInfo[] {
    return containers.map((container) => ({
      ...container,
      ...(container.state === "running"
        ? (stats.get(container.id) ?? {
            cpuPercent: null,
            memoryBytes: null,
            memoryLimitBytes: null,
          })
        : { cpuPercent: null, memoryBytes: null, memoryLimitBytes: null }),
    }));
  }

  async function refreshList(): Promise<void> {
    if (!client) return;
    try {
      const list = await client.getJson("/containers/json?all=1", lifecycle.signal);
      const entries = Array.isArray(list) ? list : [];
      const containers = entries
        .map(parseContainer)
        .filter((entry) => entry !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      labels.clear();
      for (const entry of entries) {
        const parsed = parseContainer(entry);
        if (parsed) labels.set(parsed.id, discoveryLabels(entry));
      }
      const ids = new Set(containers.map((container) => container.id));
      for (const id of [...stats.keys()]) if (!ids.has(id)) stats.delete(id);
      for (const id of [...cpuSamples.keys()]) if (!ids.has(id)) cpuSamples.delete(id);
      if (!snapshot.available)
        writeLog("info", "docker.connected", { endpoint: endpoint?.description });
      update({ available: true, error: null, containers: withStats(containers), updatedAt: now() });
    } catch (error) {
      if (lifecycle.signal.aborted) return;
      const message = error instanceof DockerError ? error.message : "Docker can't be reached";
      if (snapshot.available || snapshot.error !== message) {
        writeLog("warn", "docker.unavailable", { endpoint: endpoint?.description, message });
      }
      update({ available: false, error: message, containers: [], updatedAt: now() });
    }
  }

  function scheduleRefresh() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void refresh();
    }, EVENT_DEBOUNCE_MS);
  }

  function refresh(): Promise<void> {
    refreshing ??= refreshList().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function refreshStats(): Promise<void> {
    if (!client || !snapshot.available) return;
    const queue = snapshot.containers.filter((container) => container.state === "running");
    const workers = Array.from({ length: STATS_CONCURRENCY }, async () => {
      for (let container = queue.shift(); container; container = queue.shift()) {
        try {
          const parsed = parseStats(
            await client.getJson(
              `/containers/${container.id}/stats?stream=false&one-shot=true`,
              lifecycle.signal
            )
          );
          const previous = cpuSamples.get(container.id);
          if (parsed.cpu) cpuSamples.set(container.id, parsed.cpu);
          stats.set(container.id, {
            cpuPercent: parsed.cpu ? cpuPercent(previous, parsed.cpu) : null,
            memoryBytes: parsed.memoryBytes,
            memoryLimitBytes: parsed.memoryLimitBytes,
          });
        } catch {
          // A container that stopped meanwhile; the next list refresh catches up.
        }
      }
    });
    await Promise.all(workers);
    if (snapshot.available) {
      update({ ...snapshot, containers: withStats(snapshot.containers), updatedAt: now() });
    }
  }

  /** Follows Docker's event stream, reconnecting with a growing delay when it drops. */
  async function followEvents(): Promise<void> {
    let delay = RECONNECT_MIN_MS;
    while (running && client) {
      try {
        const filters = encodeURIComponent(JSON.stringify({ type: ["container"] }));
        const body = await client.stream(`/events?filters=${filters}`, lifecycle.signal);
        delay = RECONNECT_MIN_MS;
        // Events missed while disconnected are covered by a fresh list.
        void refresh();
        const reader = body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as { Action?: unknown };
              const action = typeof event.Action === "string" ? event.Action.split(":")[0] : "";
              if (CONTAINER_EVENTS.has(action)) scheduleRefresh();
            } catch {
              // Not a JSON line; ignore it.
            }
          }
        }
      } catch {
        if (!running) return;
      }
      if (!running) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(RECONNECT_MAX_MS, delay * 2);
    }
  }

  return {
    start() {
      if (running || !client) return;
      running = true;
      lifecycle = new AbortController();
      void refresh().then(() => refreshStats());
      timers.push(setInterval(() => void refresh(), LIST_INTERVAL_MS));
      timers.push(setInterval(() => void refreshStats(), STATS_INTERVAL_MS));
      void followEvents();
    },
    stop() {
      running = false;
      lifecycle.abort();
      for (const timer of timers.splice(0)) clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      debounce = null;
    },
    snapshot: () => snapshot,
    /** Each container with the labels discovery reads. */
    labeled: () =>
      snapshot.containers.map((container) => ({
        container,
        labels: labels.get(container.id) ?? {},
      })),
    /** For tests: run the periodic work now. */
    refreshForTesting: async () => {
      await refresh();
      await refreshStats();
    },
  };
}

export type DockerMonitor = ReturnType<typeof createDockerMonitor>;

export const dockerMonitor = createDockerMonitor({ endpoint: resolveDockerEndpoint() });
