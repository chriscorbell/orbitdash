import { requestJson } from "@/lib/api/client";
import { eventStream } from "@/lib/live/event-stream";
import * as z from "zod/mini";
import type { DockerSnapshot } from "@shared/types";

// Only the lazily loaded containers tile and the Stats page use these.
export const dockerSnapshotSchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
  error: z.nullable(z.string()),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      image: z.string(),
      state: z.enum(["created", "running", "paused", "restarting", "removing", "exited", "dead"]),
      status: z.string(),
      health: z.nullable(z.enum(["healthy", "unhealthy", "starting"])),
      createdAt: z.number(),
      ports: z.array(
        z.object({
          privatePort: z.number(),
          publicPort: z.number(),
          protocol: z.enum(["tcp", "udp", "sctp"]),
        })
      ),
      composeProject: z.nullable(z.string()),
      cpuPercent: z.nullable(z.number()),
      memoryBytes: z.nullable(z.number()),
      memoryLimitBytes: z.nullable(z.number()),
    })
  ),
  updatedAt: z.nullable(z.number()),
});

export function fetchDocker(): Promise<DockerSnapshot> {
  return requestJson("/api/docker", {}, "Couldn't load containers", dockerSnapshotSchema);
}

export function subscribeContainers(listener: (snapshot: DockerSnapshot) => void): () => void {
  return eventStream.subscribe("containers", (event) => listener(event.snapshot));
}
