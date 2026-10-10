import { TOPIC_BY_EVENT_TYPE, type EventTopic, type ServerEvent } from "@shared/events";

type EventListener = (event: ServerEvent) => void;

interface Subscription {
  listener: EventListener;
  topics: ReadonlySet<EventTopic>;
}

const subscriptions = new Set<Subscription>();

/** Delivers an event to every subscriber of its topic. A failing listener is dropped. */
export function publish(event: ServerEvent): void {
  const topic = TOPIC_BY_EVENT_TYPE[event.type];
  for (const subscription of subscriptions) {
    if (!subscription.topics.has(topic)) continue;
    try {
      subscription.listener(event);
    } catch {
      subscriptions.delete(subscription);
    }
  }
}

export function subscribeEvents(
  topics: readonly EventTopic[],
  listener: EventListener
): () => void {
  const subscription: Subscription = { listener, topics: new Set(topics) };
  subscriptions.add(subscription);
  return () => {
    subscriptions.delete(subscription);
  };
}

export function getEventSubscriberCount(): number {
  return subscriptions.size;
}
