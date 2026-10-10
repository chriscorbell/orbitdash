import { z } from "zod";
import {
  CUSTOM_CSS_MAX_LENGTH,
  isSearchUrlTemplate,
  SEARCH_ENGINE_OPTIONS,
  TITLE_MAX_LENGTH,
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  WALLPAPER_FILENAME_PATTERN,
} from "./dashboard-settings";

/** Request and response validation for settings; the zod-free logic lives in dashboard-settings. */

const modeSchema = z.enum(["columns", "rows"]);
const densitySchema = z.enum(["compact", "comfortable", "tiles"]);
const themeSchema = z.enum(["dark", "light", "system"]);
const accentSchema = z.enum(["ice", "mint", "amber", "rose", "violet", "graphite"]);
const titleSchema = z
  .string()
  .max(TITLE_MAX_LENGTH, `title must be ${TITLE_MAX_LENGTH} characters or fewer`);
const wallpaperSchema = z
  .string()
  .regex(WALLPAPER_FILENAME_PATTERN, "wallpaper must be an uploaded image")
  .nullable();
const wallpaperBlurSchema = z.number().int().min(0).max(WALLPAPER_BLUR_MAX);
const wallpaperDimSchema = z.number().int().min(0).max(WALLPAPER_DIM_MAX);
const searchEngineSchema = z.enum(SEARCH_ENGINE_OPTIONS);
const searchUrlSchema = z
  .string()
  .refine(isSearchUrlTemplate, "custom search URL must be an http(s) URL with %s for the query");
const customCssSchema = z
  .string()
  .max(CUSTOM_CSS_MAX_LENGTH, `custom CSS must be ${CUSTOM_CSS_MAX_LENGTH} characters or fewer`);

/** Request bodies are strict, so typos are reported instead of silently ignored. */
export const dashboardSettingsPatchSchema = z
  .object({
    appearance: z
      .object({
        accent: accentSchema.optional(),
        theme: themeSchema.optional(),
        title: titleSchema.optional(),
        wallpaper: wallpaperSchema.optional(),
        wallpaperBlur: wallpaperBlurSchema.optional(),
        wallpaperDim: wallpaperDimSchema.optional(),
        customCss: customCssSchema.optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        mode: modeSchema.optional(),
        density: densitySchema.optional(),
        statsPosition: z.enum(["top", "bottom"]).optional(),
        showServices: z.boolean().optional(),
        showStats: z.boolean().optional(),
        showStatsPage: z.boolean().optional(),
      })
      .strict()
      .optional(),
    search: z
      .object({ engine: searchEngineSchema.optional(), customUrl: searchUrlSchema.optional() })
      .strict()
      .optional(),
  })
  .strict();

export const dashboardSettingsSchema = z.object({
  appearance: z.object({
    accent: accentSchema,
    theme: themeSchema,
    title: titleSchema,
    wallpaper: wallpaperSchema,
    wallpaperBlur: wallpaperBlurSchema,
    wallpaperDim: wallpaperDimSchema,
    customCss: customCssSchema,
  }),
  layout: z.object({
    mode: modeSchema,
    density: densitySchema,
    statsPosition: z.enum(["top", "bottom"]),
    showServices: z.boolean(),
    showStats: z.boolean(),
    showStatsPage: z.boolean(),
  }),
  search: z.object({ engine: searchEngineSchema, customUrl: searchUrlSchema }),
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
