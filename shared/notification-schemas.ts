import { z } from "zod";
import {
  DEFAULT_EVENT_TOGGLES,
  DOWN_DELAY_MINUTES,
  GOTIFY_PRIORITY,
  HEADER_NAME_PATTERN,
  HEADER_VALUE_PATTERN,
  isDiscordWebhookUrl,
  isMaskedSecret,
  isValidTimeZone,
  MAX_NTFY_TAGS,
  MAX_WEBHOOK_HEADERS,
  normalizeServerUrl,
  NOTIFICATION_CHANNEL_TYPES,
  NTFY_DEFAULT_SERVER,
  NTFY_PRIORITY,
  NTFY_TAG_PATTERN,
  NTFY_TOPIC_PATTERN,
  parseClock,
  parseHttpUrl,
  RESERVED_HEADER_NAMES,
} from "./notifications";
import type {
  NotificationChannel,
  NotificationDelivery,
  NotificationOptions,
  NotificationsResponse,
  NotificationTestResult,
} from "./types";

/*
 * Request bodies for /api/notifications. A channel is created with every secret; an update may
 * leave a secret out (or send back its mask) to keep the stored one.
 */

const MAX_URL_LENGTH = 2048;
const MAX_TOKEN_LENGTH = 512;

const nameSchema = z
  .string()
  .trim()
  .min(1, "channel name is required")
  .max(60, "channel name must be 60 characters or fewer");

const eventsSchema = z.object({ status: z.boolean(), alerts: z.boolean() }).strict();

const serverUrlSchema = (label: string) =>
  z
    .string()
    .max(MAX_URL_LENGTH)
    .refine(
      (value) => normalizeServerUrl(value) !== null,
      `${label} server must be an http(s) URL without a password, query or fragment`
    )
    .transform((value) => normalizeServerUrl(value) as string);

const httpUrlSchema = (message: string) =>
  z
    .string()
    .trim()
    .max(MAX_URL_LENGTH)
    .refine((value) => parseHttpUrl(value) !== null, message);

const tokenSchema = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(MAX_TOKEN_LENGTH, "token is too long")
    .regex(/^\S+$/, "token can't contain spaces");

const ntfyTopicSchema = z
  .string()
  .trim()
  .regex(NTFY_TOPIC_PATTERN, "ntfy topic may use letters, numbers, - and _, up to 64");

const gotifyTokenSchema = tokenSchema("Gotify app token is required");
const discordUrlSchema = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH)
  .refine(
    isDiscordWebhookUrl,
    "Discord webhook URL must look like https://discord.com/api/webhooks/…"
  );
const webhookUrlSchema = httpUrlSchema("webhook URL must be an http(s) URL without a password");

const headerNameSchema = z
  .string()
  .trim()
  .regex(HEADER_NAME_PATTERN, "header names may only use letters, digits and - _ . !")
  .refine((name) => !RESERVED_HEADER_NAMES.has(name.toLowerCase()), "that header is set for you");
const headerValueSchema = z.string().regex(HEADER_VALUE_PATTERN, "header value is not allowed");

const tagsSchema = z
  .array(z.string().trim().regex(NTFY_TAG_PATTERN, "ntfy tags can't contain commas"))
  .max(MAX_NTFY_TAGS, `at most ${MAX_NTFY_TAGS} ntfy tags`);

/** A stored secret is kept when an update leaves it out or sends its mask back. */
const keptSecret = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (isMaskedSecret(value) ? undefined : value), schema.optional());

function rejectDuplicateHeaders(headers: Array<{ name: string }>, ctx: z.RefinementCtx) {
  const names = headers.map((header) => header.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", message: "each header can appear only once" });
  }
}

const ntfyCreate = z
  .object({
    server: serverUrlSchema("ntfy").default(NTFY_DEFAULT_SERVER),
    topic: ntfyTopicSchema,
    token: z
      .string()
      .trim()
      .max(MAX_TOKEN_LENGTH, "token is too long")
      .nullable()
      .optional()
      .transform((value) => value || null),
    priority: z
      .number()
      .int()
      .min(NTFY_PRIORITY.min)
      .max(NTFY_PRIORITY.max)
      .default(NTFY_PRIORITY.default),
    tags: tagsSchema.default([]),
  })
  .strict();

const ntfyUpdate = ntfyCreate.extend({
  topic: keptSecret(ntfyTopicSchema),
  // Left out: kept. null or "": removed.
  token: keptSecret(z.string().trim().max(MAX_TOKEN_LENGTH, "token is too long").nullable()),
});

const gotifyCreate = z
  .object({
    server: serverUrlSchema("Gotify"),
    token: gotifyTokenSchema,
    priority: z
      .number()
      .int()
      .min(GOTIFY_PRIORITY.min)
      .max(GOTIFY_PRIORITY.max)
      .default(GOTIFY_PRIORITY.default),
  })
  .strict();

const gotifyUpdate = gotifyCreate.extend({ token: keptSecret(gotifyTokenSchema) });

const discordCreate = z.object({ webhookUrl: discordUrlSchema }).strict();
const discordUpdate = z.object({ webhookUrl: keptSecret(discordUrlSchema) }).strict();

const webhookCreate = z
  .object({
    url: webhookUrlSchema,
    headers: z
      .array(z.object({ name: headerNameSchema, value: headerValueSchema }).strict())
      .max(MAX_WEBHOOK_HEADERS, `at most ${MAX_WEBHOOK_HEADERS} headers`)
      .superRefine(rejectDuplicateHeaders)
      .default([]),
  })
  .strict();

const webhookUpdate = z
  .object({
    url: keptSecret(webhookUrlSchema),
    // A header without a value keeps the value stored under its name.
    headers: z
      .array(z.object({ name: headerNameSchema, value: keptSecret(headerValueSchema) }).strict())
      .max(MAX_WEBHOOK_HEADERS, `at most ${MAX_WEBHOOK_HEADERS} headers`)
      .superRefine(rejectDuplicateHeaders)
      .default([]),
  })
  .strict();

const channelFields = {
  name: nameSchema,
  events: eventsSchema.default(DEFAULT_EVENT_TOGGLES),
};

/** POST /api/notifications/channels, and POST /api/notifications/test for an unsaved channel. */
export const notificationChannelCreateSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...channelFields, type: z.literal("ntfy"), config: ntfyCreate }).strict(),
    z.object({ ...channelFields, type: z.literal("gotify"), config: gotifyCreate }).strict(),
    z.object({ ...channelFields, type: z.literal("discord"), config: discordCreate }).strict(),
    z.object({ ...channelFields, type: z.literal("webhook"), config: webhookCreate }).strict(),
  ],
  { error: `type must be one of ${NOTIFICATION_CHANNEL_TYPES.join(", ")}` }
);

/** PUT /api/notifications/channels/:id; also the optional body of a saved channel's test. */
export const notificationChannelUpdateSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...channelFields, type: z.literal("ntfy"), config: ntfyUpdate }).strict(),
    z.object({ ...channelFields, type: z.literal("gotify"), config: gotifyUpdate }).strict(),
    z.object({ ...channelFields, type: z.literal("discord"), config: discordUpdate }).strict(),
    z.object({ ...channelFields, type: z.literal("webhook"), config: webhookUpdate }).strict(),
  ],
  { error: `type must be one of ${NOTIFICATION_CHANNEL_TYPES.join(", ")}` }
);

export type NotificationChannelCreate = z.infer<typeof notificationChannelCreateSchema>;
export type NotificationChannelUpdate = z.infer<typeof notificationChannelUpdateSchema>;

const clockSchema = z
  .string()
  .refine((value) => parseClock(value) !== null, "times must look like 22:00");

/** PUT /api/notifications/options */
export const notificationOptionsSchema = z
  .object({
    downDelayMinutes: z
      .number()
      .int()
      .refine(
        (value) => (DOWN_DELAY_MINUTES as readonly number[]).includes(value),
        "delay is not one of the allowed choices"
      ),
    quietHours: z
      .object({ enabled: z.boolean(), start: clockSchema, end: clockSchema })
      .strict()
      .refine(
        (quiet) => quiet.start !== quiet.end,
        "quiet hours must start and end at different times"
      ),
    timeZone: z
      .string()
      .refine(isValidTimeZone, "time zone must be an IANA name like Europe/Berlin")
      .nullable(),
  })
  .strict() satisfies z.ZodType<NotificationOptions>;

/*
 * Response shapes. The browser parses the same shapes with zod/mini (src/lib/api/notifications.ts),
 * and a test keeps the two in agreement. Stored channels are read back with the channel schema too.
 */

const channelBase = {
  id: z.string(),
  name: z.string(),
  events: z.object({ status: z.boolean(), alerts: z.boolean() }),
  createdAt: z.number(),
  updatedAt: z.number(),
};

export const notificationChannelSchema = z.discriminatedUnion("type", [
  z.object({
    ...channelBase,
    type: z.literal("ntfy"),
    config: z.object({
      server: z.string(),
      topic: z.string(),
      token: z.string().nullable(),
      priority: z.number(),
      tags: z.array(z.string()),
    }),
  }),
  z.object({
    ...channelBase,
    type: z.literal("gotify"),
    config: z.object({ server: z.string(), token: z.string(), priority: z.number() }),
  }),
  z.object({
    ...channelBase,
    type: z.literal("discord"),
    config: z.object({ webhookUrl: z.string() }),
  }),
  z.object({
    ...channelBase,
    type: z.literal("webhook"),
    config: z.object({
      url: z.string(),
      headers: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  }),
]) satisfies z.ZodType<NotificationChannel>;

export const notificationDeliverySchema = z.object({
  id: z.number(),
  channelId: z.string(),
  channelName: z.string(),
  channelType: z.enum(NOTIFICATION_CHANNEL_TYPES),
  event: z.enum([
    "service.down",
    "service.recovered",
    "alert.firing",
    "alert.resolved",
    "summary",
    "test",
  ]),
  title: z.string(),
  ok: z.boolean(),
  attempts: z.number(),
  error: z.string().nullable(),
  sentAt: z.number(),
}) satisfies z.ZodType<NotificationDelivery>;

const optionsResponseShape = z.object({
  downDelayMinutes: z.number(),
  quietHours: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  timeZone: z.string().nullable(),
});

export const notificationsResponseSchema = z.object({
  channels: z.array(notificationChannelSchema),
  options: optionsResponseShape,
  deliveries: z.array(notificationDeliverySchema),
  serverTimeZone: z.string(),
}) satisfies z.ZodType<NotificationsResponse>;

export const notificationTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  delivery: notificationDeliverySchema.nullable(),
}) satisfies z.ZodType<NotificationTestResult>;
