import * as z from "zod/mini";
import { jsonBody, request, requestJson } from "@/lib/api/client";
import type {
  NotificationChannel,
  NotificationOptions,
  NotificationsResponse,
  NotificationTestResult,
} from "@shared/types";

/**
 * Notification responses, parsed with zod/mini. They live here rather than in schemas.ts so they
 * load with the lazy notification settings, not the first paint; the pair test in schemas.test.ts
 * keeps them in agreement with shared/notification-schemas.ts.
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
      token: z.nullable(z.string()),
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
]);

export const notificationDeliverySchema = z.object({
  id: z.number(),
  channelId: z.string(),
  channelName: z.string(),
  channelType: z.enum(["ntfy", "gotify", "discord", "webhook"]),
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
  error: z.nullable(z.string()),
  sentAt: z.number(),
});

const optionsSchema = z.object({
  downDelayMinutes: z.number(),
  quietHours: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  timeZone: z.nullable(z.string()),
});

export const notificationsResponseSchema = z.object({
  channels: z.array(notificationChannelSchema),
  options: optionsSchema,
  deliveries: z.array(notificationDeliverySchema),
  serverTimeZone: z.string(),
});

export const notificationTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.nullable(z.string()),
  delivery: z.nullable(notificationDeliverySchema),
});

const channelResponseSchema = z.object({ channel: notificationChannelSchema });
const optionsResponseSchema = z.object({ options: optionsSchema });

/** What the add and edit forms send; secrets left out keep their stored values on update. */
export interface ChannelPayload {
  name: string;
  events: { status: boolean; alerts: boolean };
  type: NotificationChannel["type"];
  config: Record<string, unknown>;
}

const channelPath = (id: string) => `/api/notifications/channels/${encodeURIComponent(id)}`;

export function fetchNotifications(): Promise<NotificationsResponse> {
  return requestJson(
    "/api/notifications",
    {},
    "Failed to load notifications",
    notificationsResponseSchema
  );
}

export async function createNotificationChannel(
  payload: ChannelPayload
): Promise<NotificationChannel> {
  const response = await requestJson(
    "/api/notifications/channels",
    jsonBody("POST", payload),
    "Couldn't add the channel",
    channelResponseSchema
  );
  return response.channel;
}

export async function updateNotificationChannel(
  id: string,
  payload: ChannelPayload
): Promise<NotificationChannel> {
  const response = await requestJson(
    channelPath(id),
    jsonBody("PUT", payload),
    "Couldn't save the channel",
    channelResponseSchema
  );
  return response.channel;
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  await request(channelPath(id), { method: "DELETE" }, "Couldn't delete the channel");
}

/** Tests a saved channel (with unsaved edits when a payload is given) or a new one. */
export function testNotificationChannel(
  id: string | null,
  payload?: ChannelPayload
): Promise<NotificationTestResult> {
  const path = id === null ? "/api/notifications/test" : `${channelPath(id)}/test`;
  return requestJson(
    path,
    payload ? jsonBody("POST", payload) : { method: "POST" },
    "Couldn't send the test",
    notificationTestResultSchema
  );
}

export async function updateNotificationOptions(
  options: NotificationOptions
): Promise<NotificationOptions> {
  const response = await requestJson(
    "/api/notifications/options",
    jsonBody("PUT", options),
    "Couldn't save notification options",
    optionsResponseSchema
  );
  return response.options;
}
