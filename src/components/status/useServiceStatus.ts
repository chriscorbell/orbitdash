import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchStatuses, fetchStatusHistory } from "@/lib/api/status";
import { eventStream, type EventStream } from "@/lib/live/event-stream";
import type { StatusEvent } from "@shared/events";
import type { ServiceStatus } from "@shared/types";

export const STATUS_QUERY_KEY = ["statuses"] as const;

/** Statuses by service id; a service with checks on but no entry hasn't been checked yet. */
export type StatusMap = Readonly<Record<string, ServiceStatus>>;

async function fetchStatusMap(): Promise<StatusMap> {
  const statuses = await fetchStatuses();
  return Object.fromEntries(statuses.map((status) => [status.id, status]));
}

export function applyStatusEvent(map: StatusMap, event: StatusEvent): StatusMap {
  if (event.status) return { ...map, [event.id]: event.status };
  if (!(event.id in map)) return map;
  const { [event.id]: _removed, ...rest } = map;
  return rest;
}

interface Feed {
  stop: () => void;
  users: number;
}

const feeds = new WeakMap<QueryClient, Feed>();

/**
 * Keeps the cached statuses current from `status` events: one subscription per query client,
 * however many cards show a status. Events can be missed while the connection is down or the tab
 * is hidden, so coming back refetches the lot.
 */
export function retainStatusFeed(client: QueryClient, stream: EventStream = eventStream) {
  let feed = feeds.get(client);
  if (!feed) {
    let lostConnection = false;
    const stopStatus = stream.subscribe("status", (event) => {
      client.setQueryData<StatusMap>(STATUS_QUERY_KEY, (current) =>
        current ? applyStatusEvent(current, event) : current
      );
    });
    const stopConnection = stream.onConnection((connection) => {
      if (connection === "error") {
        lostConnection = true;
        return;
      }
      if (connection === "resumed" || lostConnection) {
        lostConnection = false;
        void client.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      }
    });
    feed = {
      users: 0,
      stop: () => {
        stopStatus();
        stopConnection();
      },
    };
    feeds.set(client, feed);
  }

  const retained = feed;
  retained.users += 1;
  return () => {
    retained.users -= 1;
    if (retained.users === 0) {
      retained.stop();
      feeds.delete(client);
    }
  };
}

/**
 * One service's live status; re-renders only when that service's status changes. Undefined until
 * the statuses have loaded, null when the service has none (not checked yet).
 */
export function useServiceStatus(
  serviceId: string,
  stream: EventStream = eventStream
): ServiceStatus | null | undefined {
  const client = useQueryClient();
  useEffect(() => retainStatusFeed(client, stream), [client, stream]);

  const select = useCallback((map: StatusMap) => map[serviceId] ?? null, [serviceId]);
  const { data, isError } = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: fetchStatusMap,
    select,
  });
  return isError ? null : data;
}

/** The last 24 hours, fetched when the details open and kept for a minute. */
export function useStatusHistory(serviceId: string) {
  return useQuery({
    queryKey: ["status-history", serviceId, "24h"],
    queryFn: () => fetchStatusHistory(serviceId, "24h"),
    staleTime: 60_000,
  });
}
