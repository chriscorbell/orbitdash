import { jsonBody, requestJson } from "@/lib/api/client";
import * as z from "zod/mini";
import type { ImportPreview, ImportResult, ImportServiceInput } from "@shared/types";

// Only the lazily loaded import dialog and its file picker use these.
export const importPreviewSchema = z.object({
  format: z.enum(["homepage", "dashy", "homer", "homarr", "bookmarks", "orbitdash-seed"]),
  groups: z.array(
    z.object({
      name: z.string(),
      services: z.array(
        z.object({
          name: z.string(),
          url: z.string(),
          description: z.nullable(z.string()),
          iconUrl: z.nullable(z.string()),
          duplicate: z.boolean(),
        })
      ),
    })
  ),
  warnings: z.array(z.string()),
});

export const importResultSchema = z.object({
  created: z.number(),
  failed: z.array(z.object({ name: z.string(), error: z.string() })),
  iconFailures: z.number(),
  snapshot: z.nullable(z.string()),
});

/** What a Homepage, Dashy, Homer, Homarr or bookmarks file would add, without adding anything. */
export function previewImport(content: string): Promise<ImportPreview> {
  return requestJson(
    "/api/import/preview",
    jsonBody("POST", { content }),
    "Couldn't read that file",
    importPreviewSchema
  );
}

/** Adds the picked services; a snapshot is taken first. */
export function applyImport(services: ImportServiceInput[]): Promise<ImportResult> {
  return requestJson(
    "/api/import/apply",
    jsonBody("POST", { services }),
    "The import failed",
    importResultSchema
  );
}
