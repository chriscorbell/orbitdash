import type { IntegrationReading, Service } from "@shared/types";
import { getEventSubscriberCount, publish } from "../events";
import { getAdapter } from "./adapters";
import { createAdapterHttp, type IntegrationFetch } from "./http";
import { listIntegrations, toAdapterConfig } from "./store";
import { IntegrationError, type AdapterConfig, type IntegrationAdapter } from "./types";

const TICK_MS = 5_000;
const CONCURRENCY = 4;
/** After a page asked for readings, keep them fresh this long even without a live connection. */
const ACTIVE_FOR_MS = 5 * 60_000;

/** One reading from an adapter; failures become a short message, never a crash. */
export async function readIntegration(
  adapter: IntegrationAdapter,
  config: AdapterConfig,
  fetchImpl?: IntegrationFetch
): Promise<IntegrationReading> {
  const http = createAdapterHttp(config.url, {
    ignoreTls: config.values.ignoreTls === true,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  try {
    const stats = (await adapter.read(config, { http })).slice(0, 4);
    return { type: adapter.id, stats, error: null, updatedAt: Date.now() };
  } catch (error) {
    const message = error instanceof IntegrationError ? error.message : "Couldn't read it";
    return { type: adapter.id, stats: [], error: message, updatedAt: Date.now() };
  }
}

export interface IntegrationPollerOptions {
  listServices: () => Service[];
  now?: () => number;
  fetch?: IntegrationFetch;
}

/**
 * Keeps each integration's reading fresh on its own interval while someone is looking (a live
 * connection, or a page that asked recently), and pushes new readings on the `integrations` topic.
 */
export function createIntegrationPoller({
  listServices,
  now = () => Date.now(),
  fetch,
}: IntegrationPollerOptions) {
  const readings = new Map<string, IntegrationReading>();
  const inflight = new Set<string>();
  let activeUntil = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(force = false): Promise<void> {
    const services = new Map(listServices().map((service) => [service.id, service]));
    const integrations = listIntegrations();
    for (const id of [...readings.keys()]) {
      if (!integrations.has(id) || !services.has(id)) readings.delete(id);
    }

    const due = [...integrations].filter(([id, stored]) => {
      const adapter = getAdapter(stored.type);
      const reading = readings.get(id);
      return (
        adapter &&
        services.has(id) &&
        !inflight.has(id) &&
        (force ||
          !reading ||
          reading.type !== stored.type ||
          reading.updatedAt < stored.updatedAt ||
          now() - reading.updatedAt >= adapter.pollIntervalMs)
      );
    });

    const queue = [...due];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [id, stored] = next;
          const adapter = getAdapter(stored.type)!;
          inflight.add(id);
          try {
            const result = await readIntegration(
              adapter,
              toAdapterConfig(stored, services.get(id)!.url),
              fetch
            );
            const reading = { ...result, updatedAt: now() };
            readings.set(id, reading);
            publish({ type: "integration", serviceId: id, reading });
          } finally {
            inflight.delete(id);
          }
        }
      })
    );
  }

  return {
    /** The latest readings; asking also keeps them fresh for a while and refreshes stale ones. */
    readings(): Record<string, IntegrationReading> {
      activeUntil = now() + ACTIVE_FOR_MS;
      void refresh();
      return Object.fromEntries(readings);
    },
    refresh,
    forget(serviceId: string) {
      readings.delete(serviceId);
    },
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (getEventSubscriberCount() > 0 || now() < activeUntil) void refresh();
      }, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
