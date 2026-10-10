import { z } from "zod";

const fieldValue = z.union([z.string().max(2000), z.boolean(), z.null()]);

/** PUT /api/integrations/services/:id — omitted secrets keep the stored value, null clears it. */
export const integrationSaveSchema = z
  .object({
    type: z.string().trim().min(1).max(50),
    values: z.record(z.string().max(50), fieldValue).default({}),
  })
  .strict();

/** POST /api/integrations/test — the form's values; stored secrets fill in what's left out. */
export const integrationTestSchema = integrationSaveSchema
  .extend({
    serviceId: z.string().max(100).nullable().default(null),
    url: z.string().trim().max(2000),
  })
  .strict();

export const integrationTypesSchema = z.object({
  types: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      fields: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          kind: z.enum(["url", "text", "secret", "toggle"]),
          required: z.boolean(),
          placeholder: z.string().optional(),
          help: z.string().optional(),
        })
      ),
    })
  ),
});

export const serviceIntegrationSchema = z.object({
  integration: z
    .object({
      type: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.boolean()])),
      secretsSet: z.array(z.string()),
    })
    .nullable(),
});

const statSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["good", "warning", "bad"]).optional(),
});

export const integrationReadingSchema = z.object({
  type: z.string(),
  stats: z.array(statSchema),
  error: z.string().nullable(),
  updatedAt: z.number(),
});

export const integrationReadingsSchema = z.object({
  readings: z.record(z.string(), integrationReadingSchema),
});
