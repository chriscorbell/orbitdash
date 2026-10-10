import { useSyncExternalStore } from "react";
import type { IntegrationReading } from "@shared/types";

/** The layer's query; invalidating it refetches every reading. */
export const INTEGRATION_READINGS_KEY = ["integrations", "readings"] as const;

export type IntegrationReadings = Record<string, IntegrationReading>;

// A plain store rather than the query cache, so cards read figures without a query client.
let readings: IntegrationReadings = {};
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setIntegrationReadings(next: IntegrationReadings) {
  readings = next;
  notify();
}

export function updateIntegrationReading(serviceId: string, reading: IntegrationReading) {
  readings = { ...readings, [serviceId]: reading };
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A service's latest integration figures, once the integration layer has loaded them. */
export function useIntegrationReading(serviceId: string): IntegrationReading | undefined {
  return useSyncExternalStore(
    subscribe,
    () => readings[serviceId],
    () => undefined
  );
}
