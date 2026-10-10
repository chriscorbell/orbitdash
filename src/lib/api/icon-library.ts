import { requestJson } from "@/lib/api/client";
import * as z from "zod/mini";
import type { IconLibraryResponse } from "@shared/types";

// Only the lazily loaded service dialog uses this, so it stays out of the first paint.
export const iconLibraryResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      source: z.enum(["dashboard-icons", "selfhst"]),
      slug: z.string(),
      name: z.string(),
      url: z.string(),
    })
  ),
  updatedAt: z.number(),
});

/** Icons from dashboard-icons and selfh.st that match a query, best first. */
export function searchIconLibrary(query: string, limit = 48): Promise<IconLibraryResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return requestJson(
    `/api/icon-library?${params}`,
    {},
    "The icon library is unavailable right now",
    iconLibraryResponseSchema
  );
}
