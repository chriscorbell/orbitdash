import { z } from "zod";
import { normalizeServiceLinks } from "./service-links";
import { CHECK_INTERVAL_MAX_S, CHECK_INTERVAL_MIN_S, STATUS_CHECK_METHODS } from "./status";
import { normalizeTags } from "./tags";
import { normalizeIconUrl, normalizeServiceUrl } from "./urls";

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimOptionalString(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  return trimString(value);
}

function trimNullableString(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = trimString(value);
  return trimmed === "" ? null : trimmed;
}

const requiredNameSchema = z.preprocess(trimString, z.string().min(1, "name is required"));

const optionalNameSchema = z.preprocess(
  trimOptionalString,
  z.string().min(1, "name is required").optional()
);

const createTextFieldSchema = z
  .preprocess(trimNullableString, z.string().nullable().optional())
  .transform((value) => value ?? null);

const updateTextFieldSchema = z.preprocess(trimNullableString, z.string().nullable().optional());

const requiredServiceUrlSchema = z
  .preprocess(
    trimString,
    z.string().refine((value) => normalizeServiceUrl(value) !== null, {
      message: "service url must be a valid URL",
    })
  )
  .transform((value) => normalizeServiceUrl(value)!);

const optionalServiceUrlSchema = z
  .preprocess(
    trimOptionalString,
    z
      .string()
      .refine((value) => normalizeServiceUrl(value) !== null, {
        message: "service url must be a valid URL",
      })
      .optional()
  )
  .transform((value) => (value === undefined ? undefined : normalizeServiceUrl(value)!));

/** An optional second URL: blank clears it, anything else must normalize like the main link. */
const externalUrlSchema = z.preprocess(
  trimNullableString,
  z
    .string({ error: "external url must be a valid URL" })
    .nullable()
    .optional()
    .refine((value) => !value || normalizeServiceUrl(value) !== null, {
      message: "external url must be a valid URL",
    })
    .transform((value) => (value ? normalizeServiceUrl(value)! : value))
);

const createExternalUrlSchema = externalUrlSchema.transform((value) => value ?? null);

const LINKS_TYPE_ERROR = "links must be a list of { label, url }";

const linksSchema = z
  .array(
    z.object(
      {
        label: z.string({ error: LINKS_TYPE_ERROR }),
        url: z.string({ error: LINKS_TYPE_ERROR }),
      },
      { error: LINKS_TYPE_ERROR }
    ),
    { error: LINKS_TYPE_ERROR }
  )
  .transform((links, ctx) => {
    const result = normalizeServiceLinks(links);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.value;
  })
  .optional();

const TAGS_TYPE_ERROR = "tags must be a list of strings";

const tagsSchema = z
  .array(z.string({ error: TAGS_TYPE_ERROR }), { error: TAGS_TYPE_ERROR })
  .transform((tags, ctx) => {
    const result = normalizeTags(tags);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.value;
  })
  .optional();

const createIconUrlSchema = z
  .preprocess(
    trimNullableString,
    z
      .string()
      .nullable()
      .optional()
      .refine(
        (value) => {
          return value === undefined || value === null || normalizeIconUrl(value) !== null;
        },
        {
          message: "icon url must be a valid http(s) URL",
        }
      )
  )
  .transform((value) => {
    if (value === undefined || value === null) {
      return null;
    }

    return normalizeIconUrl(value)!;
  });

const updateIconUrlSchema = z
  .preprocess(
    trimNullableString,
    z
      .string()
      .nullable()
      .optional()
      .refine(
        (value) => {
          return value === undefined || value === null || normalizeIconUrl(value) !== null;
        },
        {
          message: "icon url must be a valid http(s) URL",
        }
      )
  )
  .transform((value) => {
    if (value === undefined || value === null) {
      return value;
    }

    return normalizeIconUrl(value)!;
  });

export const CHECK_INTERVAL_MESSAGE = `check interval must be a whole number of seconds from ${CHECK_INTERVAL_MIN_S} to ${CHECK_INTERVAL_MAX_S}`;

/**
 * Status check settings, all optional: service-operations fills in the defaults (checks off) or
 * the stored values, then validates the target against the method it ends up with.
 */
const checkFields = {
  check_enabled: z.boolean({ error: "check_enabled must be true or false" }).optional(),
  check_method: z
    .enum(STATUS_CHECK_METHODS, { error: "check method must be http or tcp" })
    .optional(),
  check_target: z.preprocess(
    trimNullableString,
    z.string({ error: "check target must be a string" }).nullable().optional()
  ),
  check_interval: z
    .number({ error: CHECK_INTERVAL_MESSAGE })
    .int(CHECK_INTERVAL_MESSAGE)
    .min(CHECK_INTERVAL_MIN_S, CHECK_INTERVAL_MESSAGE)
    .max(CHECK_INTERVAL_MAX_S, CHECK_INTERVAL_MESSAGE)
    .optional(),
  check_ignore_tls: z.boolean({ error: "check_ignore_tls must be true or false" }).optional(),
};

export const serviceCreateSchema = z.object({
  name: requiredNameSchema,
  url: requiredServiceUrlSchema,
  external_url: createExternalUrlSchema,
  links: linksSchema.transform((links) => links ?? []),
  tags: tagsSchema.transform((tags) => tags ?? []),
  description: createTextFieldSchema,
  icon_url: createIconUrlSchema,
  category: createTextFieldSchema,
  open_in_new_tab: z.boolean().optional().default(true),
  ...checkFields,
});

export const serviceUpdateSchema = z.object({
  name: optionalNameSchema,
  url: optionalServiceUrlSchema,
  external_url: externalUrlSchema,
  links: linksSchema,
  tags: tagsSchema,
  description: updateTextFieldSchema,
  icon_url: updateIconUrlSchema,
  category: updateTextFieldSchema,
  open_in_new_tab: z.boolean().optional(),
  ...checkFields,
});

export function getValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "invalid request";
}

export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;
