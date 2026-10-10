import type { Database } from "bun:sqlite";
import type { ServerEvent } from "@shared/events";
import { MAX_NOTIFICATION_CHANNELS } from "@shared/notifications";
import type {
  NotificationChannelCreate,
  NotificationChannelUpdate,
} from "@shared/notification-schemas";
import type {
  NotificationChannel,
  NotificationDelivery,
  NotificationOptions,
  NotificationsResponse,
  NotificationTestResult,
} from "@shared/types";
import { apiFail, apiOk, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { subscribeEvents } from "../events";
import { writeLog } from "../observability";
import { readGlobalSettings } from "../services/dashboard-settings-store";
import { applyChannelUpdate, createChannel, toChannelView } from "./channel-config";
import { buildChannelRequest } from "./channels";
import { deliver, sleep as defaultSleep, type DeliveryOutcome, type FetchLike } from "./deliver";
import { createNotificationEngine, type NotificationEngine } from "./engine";
import {
  summaryMessage,
  testMessage,
  type EventKind,
  type MessageContext,
  type NotificationMessage,
  type SummaryItem,
} from "./messages";
import {
  deleteIncident,
  insertDelivery,
  readChannels,
  readDeliveries,
  readIncidents,
  readOptions,
  readServiceInfo,
  saveIncident,
  writeChannels,
  writeOptions,
} from "./store";

/** A failing database is reported at most this often. */
const ERROR_LOG_INTERVAL_MS = 60_000;

export interface NotificationServiceOptions {
  getDatabase: () => Database;
  fetch: FetchLike;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The dashboard's name, which messages say they come from. */
  readSource: () => string;
  subscribe: (listener: (event: ServerEvent) => void) => () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Notifications for the running server: channel and option storage for the routes, the engine fed
 * by the event bus, and delivery with a log. Messages to one channel go out in order, one at a time.
 */
export function createNotificationService(options: NotificationServiceOptions) {
  const now = options.now ?? Date.now;
  const db = () => options.getDatabase();
  let engine: NotificationEngine | null = null;
  let unsubscribe: (() => void) | null = null;
  let controller = new AbortController();
  const queues = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();
  let lastErrorAt = Number.NEGATIVE_INFINITY;

  function reportError(event: string, error: unknown) {
    const time = now();
    if (time - lastErrorAt < ERROR_LOG_INTERVAL_MS) return;
    lastErrorAt = time;
    writeLog("error", event, { message: errorMessage(error) });
  }

  function record(
    channel: NotificationChannel,
    message: NotificationMessage,
    outcome: DeliveryOutcome
  ): NotificationDelivery {
    // The channel id and a short reason only: URLs and tokens never reach the log.
    writeLog(
      outcome.ok ? "info" : "warn",
      outcome.ok ? "notification.sent" : "notification.failed",
      {
        channelId: channel.id,
        channelType: channel.type,
        event: message.event,
        attempts: outcome.attempts,
        ...(outcome.ok ? {} : { reason: outcome.error }),
      }
    );
    return insertDelivery(db(), {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      event: message.event,
      title: message.title,
      ok: outcome.ok,
      attempts: outcome.attempts,
      error: outcome.error,
      sentAt: now(),
    });
  }

  function send(channel: NotificationChannel, message: NotificationMessage, attempts?: number) {
    return deliver(buildChannelRequest(channel, message, options.readSource()), {
      fetch: options.fetch,
      attempts,
      signal: controller.signal,
      sleep: options.sleep ?? defaultSleep,
    });
  }

  function enqueue(channel: NotificationChannel, message: NotificationMessage) {
    const { signal } = controller;
    const next = (queues.get(channel.id) ?? Promise.resolve())
      .then(async () => {
        if (signal.aborted) return;
        const outcome = await send(channel, message);
        // After shutdown the database may be closed; the result is dropped.
        if (!signal.aborted) record(channel, message, outcome);
      })
      .catch((error: unknown) => reportError("notification.record_failed", error));
    queues.set(channel.id, next);
    pending.add(next);
    void next.finally(() => {
      pending.delete(next);
      if (queues.get(channel.id) === next) queues.delete(channel.id);
    });
  }

  const wants = (channel: NotificationChannel, kind: EventKind) => channel.events[kind];

  function dispatch(message: NotificationMessage) {
    for (const channel of readChannels(db())) {
      if (message.kind && wants(channel, message.kind)) enqueue(channel, message);
    }
  }

  function dispatchSummary(items: SummaryItem[], ctx: MessageContext) {
    for (const channel of readChannels(db())) {
      const own = items.filter((item) => wants(channel, item.kind));
      if (own.length > 0) enqueue(channel, summaryMessage(own, ctx));
    }
  }

  function handleEvent(event: ServerEvent) {
    if (!engine) return;
    // A listener that throws is dropped from the bus, so nothing may escape.
    try {
      if (event.type === "status") engine.status(event.id, event.status);
      else if (event.type === "alert") engine.alert(event.alert);
    } catch (error) {
      reportError("notification.event_failed", error);
    }
  }

  async function runTest(
    channel: NotificationChannel,
    saved: boolean
  ): Promise<NotificationTestResult> {
    const message = testMessage(options.readSource(), { now: now(), timeZone: null });
    // One attempt: whoever pressed the button wants the answer now, and a retry hides nothing.
    const outcome = await send(channel, message, 1);
    return {
      ok: outcome.ok,
      error: outcome.detail ? `${outcome.error}: ${outcome.detail}` : outcome.error,
      delivery: saved ? record(channel, message, outcome) : null,
    };
  }

  function findChannel(id: string): NotificationChannel | undefined {
    return readChannels(db()).find((channel) => channel.id === id);
  }

  return {
    /** Loads open incidents and starts following status and alert events. */
    start() {
      if (engine) return;
      engine = createNotificationEngine(
        {
          now,
          readOptions: () => readOptions(db()),
          lookupService: (id) => readServiceInfo(db(), id),
          saveIncident: (incident) => saveIncident(db(), incident),
          deleteIncident: (id) => deleteIncident(db(), id),
          send: dispatch,
          sendSummary: dispatchSummary,
        },
        readIncidents(db())
      );
      unsubscribe = options.subscribe(handleEvent);
    },

    /** Stops following events and cancels deliveries in flight; nothing is written after this. */
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      engine = null;
      controller.abort();
      controller = new AbortController();
      queues.clear();
    },

    isRunning: () => engine !== null,

    tick() {
      if (!engine) return;
      try {
        engine.tick();
      } catch (error) {
        reportError("notification.tick_failed", error);
      }
    },

    /** Resolves once every queued delivery has finished. */
    async idle() {
      while (pending.size > 0) await Promise.all([...pending]);
    },

    read(): NotificationsResponse {
      const database = db();
      return {
        channels: readChannels(database).map(toChannelView),
        options: readOptions(database),
        deliveries: readDeliveries(database),
        serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    },

    createChannel(input: NotificationChannelCreate): ApiResult<NotificationChannel> {
      const channels = readChannels(db());
      if (channels.length >= MAX_NOTIFICATION_CHANNELS) {
        return apiFail(400, `at most ${MAX_NOTIFICATION_CHANNELS} channels`);
      }
      const channel = createChannel(input, crypto.randomUUID(), now());
      writeChannels(db(), [...channels, channel]);
      return apiOk(toChannelView(channel));
    },

    updateChannel(id: string, input: NotificationChannelUpdate): ApiResult<NotificationChannel> {
      const channels = readChannels(db());
      const stored = channels.find((channel) => channel.id === id);
      if (!stored) return apiFail(404, "not found");
      const result = applyChannelUpdate(stored, input, now());
      if (!result.ok) return apiFail(400, result.error);
      writeChannels(
        db(),
        channels.map((channel) => (channel.id === id ? result.channel : channel))
      );
      return apiOk(toChannelView(result.channel));
    },

    deleteChannel(id: string): boolean {
      const channels = readChannels(db());
      const next = channels.filter((channel) => channel.id !== id);
      if (next.length === channels.length) return false;
      writeChannels(db(), next);
      return true;
    },

    updateOptions(next: NotificationOptions): NotificationOptions {
      writeOptions(db(), next);
      return next;
    },

    /** Tests a saved channel, with unsaved edits from `draft` laid over it when given. */
    async testChannel(
      id: string,
      draft?: NotificationChannelUpdate
    ): Promise<ApiResult<NotificationTestResult>> {
      const stored = findChannel(id);
      if (!stored) return apiFail(404, "not found");
      let channel = stored;
      if (draft) {
        const merged = applyChannelUpdate(stored, draft, now());
        if (!merged.ok) return apiFail(400, merged.error);
        channel = merged.channel;
      }
      return apiOk(await runTest(channel, true));
    },

    /** Tests a channel that isn't saved yet; nothing is stored or logged. */
    testDraft(input: NotificationChannelCreate): Promise<NotificationTestResult> {
      return runTest(createChannel(input, "draft", now()), false);
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;

/** The dashboard's name, or "orbitdash" before one is set. */
function readDashboardName(): string {
  return readGlobalSettings().settings.appearance.title.trim() || "orbitdash";
}

/** The server's notifications: runtime.ts starts them with the background jobs. */
export const notifications = createNotificationService({
  getDatabase: getDb,
  // Looked up on each call, so tests can stand in for the network.
  fetch: (url, init) => fetch(url, init),
  readSource: readDashboardName,
  subscribe: (listener) => subscribeEvents(["status", "alerts"], listener),
});
