import type { Database } from "bun:sqlite";
import { DEFAULT_NOTIFICATION_OPTIONS, DELIVERY_LOG_LIMIT } from "@shared/notifications";
import { notificationChannelSchema, notificationOptionsSchema } from "@shared/notification-schemas";
import type { NotificationChannel, NotificationDelivery, NotificationOptions } from "@shared/types";

/**
 * SQL for notifications. Channels (with their secrets) and options are JSON in `settings`, so
 * backups carry them; deliveries and incidents have their own tables (migration 11).
 */

export const CHANNELS_KEY = "notifications.channels";
export const OPTIONS_KEY = "notifications.options";

function readSetting(db: Database, key: string): unknown {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as {
    value: string;
  } | null;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function writeSetting(db: Database, key: string, value: unknown) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value));
}

/** Stored channels, read leniently: a damaged entry is skipped rather than failing them all. */
export function readChannels(db: Database): NotificationChannel[] {
  const stored = readSetting(db, CHANNELS_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry) => {
    const parsed = notificationChannelSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function writeChannels(db: Database, channels: NotificationChannel[]) {
  writeSetting(db, CHANNELS_KEY, channels);
}

export function readOptions(db: Database): NotificationOptions {
  const parsed = notificationOptionsSchema.safeParse(readSetting(db, OPTIONS_KEY));
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_OPTIONS;
}

export function writeOptions(db: Database, options: NotificationOptions) {
  writeSetting(db, OPTIONS_KEY, options);
}

interface DeliveryRow {
  id: number;
  channel_id: string;
  channel_name: string;
  channel_type: NotificationDelivery["channelType"];
  event: NotificationDelivery["event"];
  title: string;
  ok: number;
  attempts: number;
  error: string | null;
  sent_at: number;
}

function fromDeliveryRow(row: DeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    event: row.event,
    title: row.title,
    ok: row.ok === 1,
    attempts: row.attempts,
    error: row.error,
    sentAt: row.sent_at,
  };
}

/** Records a delivery and drops all but the newest DELIVERY_LOG_LIMIT. */
export function insertDelivery(
  db: Database,
  delivery: Omit<NotificationDelivery, "id">
): NotificationDelivery {
  const row = db
    .prepare(
      `INSERT INTO notification_deliveries
         (channel_id, channel_name, channel_type, event, title, ok, attempts, error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      delivery.channelId,
      delivery.channelName,
      delivery.channelType,
      delivery.event,
      delivery.title,
      delivery.ok ? 1 : 0,
      delivery.attempts,
      delivery.error,
      delivery.sentAt
    ) as { id: number };
  db.prepare("DELETE FROM notification_deliveries WHERE id <= ?").run(row.id - DELIVERY_LOG_LIMIT);
  return { ...delivery, id: row.id };
}

export function readDeliveries(db: Database): NotificationDelivery[] {
  return (
    db
      .prepare("SELECT * FROM notification_deliveries ORDER BY id DESC LIMIT ?")
      .all(DELIVERY_LOG_LIMIT) as DeliveryRow[]
  ).map(fromDeliveryRow);
}

/** A service that is down, and when its "down" message went out (null until it has). */
export interface StoredIncident {
  serviceId: string;
  startedAt: number;
  notifiedAt: number | null;
}

/**
 * Open incidents, after dropping those whose service is no longer down or no longer checked (a
 * check turned off, or a service deleted, while the server was stopped).
 */
export function readIncidents(db: Database): StoredIncident[] {
  db.exec(
    `DELETE FROM notification_incidents WHERE service_id NOT IN
       (SELECT service_id FROM service_status WHERE state = 'down')`
  );
  return (
    db
      .prepare("SELECT service_id, started_at, notified_at FROM notification_incidents")
      .all() as Array<{ service_id: string; started_at: number; notified_at: number | null }>
  ).map((row) => ({
    serviceId: row.service_id,
    startedAt: row.started_at,
    notifiedAt: row.notified_at,
  }));
}

export function saveIncident(db: Database, incident: StoredIncident) {
  db.prepare(
    `INSERT INTO notification_incidents (service_id, started_at, notified_at) VALUES (?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET started_at = excluded.started_at,
       notified_at = excluded.notified_at`
  ).run(incident.serviceId, incident.startedAt, incident.notifiedAt);
}

export function deleteIncident(db: Database, serviceId: string) {
  db.prepare("DELETE FROM notification_incidents WHERE service_id = ?").run(serviceId);
}

/** The name and link of a service, for messages. */
export function readServiceInfo(db: Database, id: string): { name: string; url: string } | null {
  return db.prepare("SELECT name, url FROM services WHERE id = ?").get(id) as {
    name: string;
    url: string;
  } | null;
}
