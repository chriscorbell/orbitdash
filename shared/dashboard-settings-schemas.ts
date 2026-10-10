import { z } from "zod";

/** Request and response validation for settings; the zod-free logic lives in dashboard-settings. */

const gridColumnsSchema = z.union([z.literal(3), z.literal(4), z.literal(5)]);

/** Request bodies are strict, so typos are reported instead of silently ignored. */
export const dashboardSettingsPatchSchema = z
  .object({
    layout: z
      .object({
        gridColumns: gridColumnsSchema.optional(),
        servicesFirst: z.boolean().optional(),
        showServices: z.boolean().optional(),
        showStats: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const dashboardSettingsSchema = z.object({
  layout: z.object({
    gridColumns: gridColumnsSchema,
    servicesFirst: z.boolean(),
    showServices: z.boolean(),
    showStats: z.boolean(),
  }),
});

export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "invalid device id");

export const deviceUpdateSchema = z
  .object({
    name: z.string().trim().max(60, "name must be 60 characters or fewer").nullable().optional(),
    overrides: dashboardSettingsPatchSchema.nullable().optional(),
  })
  .strict();

export const deviceSettingsSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  overrides: dashboardSettingsPatchSchema,
});

export const dashboardSettingsResponseSchema = z.object({
  device: deviceSettingsSchema.nullable(),
  effective: dashboardSettingsSchema,
  settings: dashboardSettingsSchema,
  stored: z.boolean(),
});
