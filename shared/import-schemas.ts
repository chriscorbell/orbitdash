import { z } from "zod";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_SERVICES = 500;

export const importPreviewRequestSchema = z
  .object({
    content: z.string().min(1, "the file is empty").max(MAX_IMPORT_BYTES, "the file is too large"),
  })
  .strict();

const importServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    url: z.string().trim().min(1).max(2000),
    description: z.string().trim().max(500).nullable(),
    iconUrl: z.string().trim().max(2000).nullable(),
    category: z.string().trim().max(100).nullable(),
  })
  .strict();

export const importApplyRequestSchema = z
  .object({
    services: z
      .array(importServiceSchema)
      .min(1, "pick at least one service")
      .max(MAX_IMPORT_SERVICES, `import at most ${MAX_IMPORT_SERVICES} services at a time`),
  })
  .strict();

const previewServiceSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  iconUrl: z.string().nullable(),
  duplicate: z.boolean(),
});

export const importPreviewSchema = z.object({
  format: z.enum(["homepage", "dashy", "homer", "homarr", "bookmarks", "orbitdash-seed"]),
  groups: z.array(z.object({ name: z.string(), services: z.array(previewServiceSchema) })),
  warnings: z.array(z.string()),
});

export const importResultSchema = z.object({
  created: z.number(),
  failed: z.array(z.object({ name: z.string(), error: z.string() })),
  iconFailures: z.number(),
  snapshot: z.string().nullable(),
});
