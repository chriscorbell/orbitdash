import { buildApiUrl } from "@/lib/api/client";
import type {
  ConfigChangedEvent,
  EventTopic,
  HostEvent,
  MetricsEvent,
  ServerEvent,
} from "@shared/events";

export type ConnectionEvent = "open" | "error" | "resumed";

interface EventsByTopic {
  config: ConfigChangedEvent;
  host: HostEvent;
  metrics: MetricsEvent;
}

type EventForTopic<T extends EventTopic> = EventsByTopic[T];

interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
}

export interface EventStreamDependencies {
  createEventSource: (url: string) => EventSourceLike;
  document?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
}

export interface EventStream {
  /** Connection changes; "resumed" fires when a hidden tab comes back, so data may be stale. */
  onConnection: (listener: (event: ConnectionEvent) => void) => () => void;
  subscribe: <T extends EventTopic>(
    topic: T,
    listener: (event: EventForTopic<T>) => void
  ) => () => void;
}

const EVENT_TYPES: Record<EventTopic, ServerEvent["type"]> = {
  config: "config.changed",
  host: "host",
  metrics: "metrics",
};

/**
 * One server-sent event connection shared by everything on the page. It subscribes to exactly the
 * topics that have listeners, reconnects when that set changes, and closes while the tab is hidden
 * or nobody is listening.
 */
export function createEventStream(deps: EventStreamDependencies): EventStream {
  const doc = deps.document ?? (typeof document === "undefined" ? undefined : document);
  const listeners = new Map<EventTopic, Set<(event: ServerEvent) => void>>();
  const connectionListeners = new Set<(event: ConnectionEvent) => void>();
  let source: EventSourceLike | null = null;
  let connectedTopics = "";
  let reconcileQueued = false;
  let visibilityBound = false;

  const emitConnection = (event: ConnectionEvent) => {
    for (const listener of connectionListeners) listener(event);
  };

  const activeTopics = () =>
    [...listeners.entries()]
      .filter(([, topicListeners]) => topicListeners.size > 0)
      .map(([topic]) => topic)
      .sort();

  const close = () => {
    source?.close();
    source = null;
    connectedTopics = "";
  };

  const open = (topics: EventTopic[]) => {
    const next = deps.createEventSource(buildApiUrl(`/api/events?topics=${topics.join(",")}`));
    for (const topic of topics) {
      next.addEventListener(EVENT_TYPES[topic], (message) => {
        try {
          const event = JSON.parse(message.data) as ServerEvent;
          for (const listener of listeners.get(topic) ?? []) listener(event);
        } catch {
          // Ignore malformed events.
        }
      });
    }
    next.onopen = () => emitConnection("open");
    next.onerror = () => emitConnection("error");
    source = next;
    connectedTopics = topics.join(",");
  };

  const handleVisibilityChange = () => {
    if (doc?.visibilityState === "hidden") {
      close();
      return;
    }
    reconcile();
    emitConnection("resumed");
  };

  function reconcile() {
    const topics = activeTopics();
    const wanted = topics.join(",");

    if (topics.length > 0 && !visibilityBound) {
      doc?.addEventListener("visibilitychange", handleVisibilityChange);
      visibilityBound = true;
    } else if (topics.length === 0 && visibilityBound) {
      doc?.removeEventListener("visibilitychange", handleVisibilityChange);
      visibilityBound = false;
    }

    if (topics.length === 0 || doc?.visibilityState === "hidden") {
      close();
      return;
    }
    if (wanted !== connectedTopics) {
      close();
      open(topics);
    }
  }

  // Subscriptions made in the same render (or StrictMode's mount/unmount/mount) settle into one
  // connection instead of several reconnects.
  const scheduleReconcile = () => {
    if (reconcileQueued) return;
    reconcileQueued = true;
    queueMicrotask(() => {
      reconcileQueued = false;
      reconcile();
    });
  };

  return {
    onConnection: (listener) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
    subscribe: (topic, listener) => {
      const topicListeners = listeners.get(topic) ?? new Set();
      const wrapped = listener as (event: ServerEvent) => void;
      topicListeners.add(wrapped);
      listeners.set(topic, topicListeners);
      scheduleReconcile();

      return () => {
        topicListeners.delete(wrapped);
        scheduleReconcile();
      };
    },
  };
}

/** Stand-in for environments without EventSource (tests, very old browsers): never fires. */
const inertEventSource: EventSourceLike = {
  addEventListener: () => {},
  close: () => {},
  onerror: null,
  onopen: null,
};

export const eventStream = createEventStream({
  createEventSource: (url) =>
    typeof EventSource === "undefined" ? inertEventSource : new EventSource(url),
});
