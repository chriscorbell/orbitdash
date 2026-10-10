import { requestJson } from "@/lib/api/client";
import { hostSnapshotSchema } from "@/lib/api/schemas";
import { eventStream } from "@/lib/live/event-stream";
import type { HostSnapshot } from "@shared/types";

/** The latest full reading of the host. */
export function fetchHostSnapshot(): Promise<HostSnapshot> {
  return requestJson(
    "/api/metrics/host",
    { cache: "no-store" },
    "Failed to read host metrics",
    hostSnapshotSchema
  );
}

/** A full reading every tick over the shared event stream. Returns a cleanup function. */
export function subscribeHostSnapshots(onSnapshot: (snapshot: HostSnapshot) => void): () => void {
  return eventStream.subscribe("host", (event) => {
    const parsed = hostSnapshotSchema.safeParse(event.snapshot);
    if (parsed.success) onSnapshot(parsed.data);
  });
}
