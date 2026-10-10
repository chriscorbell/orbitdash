import { jsonBody, request, requestJson } from "@/lib/api/client";
import * as z from "zod/mini";
import type { DiscoveryResponse } from "@shared/types";

// Only the lazily loaded discovery banner uses these.
export const discoveryResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      url: z.nullable(z.string()),
      port: z.nullable(z.number()),
      iconUrl: z.nullable(z.string()),
      category: z.nullable(z.string()),
      description: z.nullable(z.string()),
      source: z.enum(["labels", "port"]),
    })
  ),
  dismissed: z.number(),
});

export function fetchDiscovery(): Promise<DiscoveryResponse> {
  return requestJson("/api/discovery", {}, "Couldn't load suggestions", discoveryResponseSchema);
}

export async function dismissSuggestion(key: string): Promise<void> {
  await request("/api/discovery/dismiss", jsonBody("POST", { key }), "Couldn't dismiss that");
}

export async function restoreDismissed(): Promise<void> {
  await request("/api/discovery/dismissed", { method: "DELETE" }, "Couldn't bring them back");
}
