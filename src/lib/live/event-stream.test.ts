// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventStream } from "@/lib/live/event-stream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  private handlers = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: string) {
    for (const handler of this.handlers.get(type) ?? []) {
      handler(new MessageEvent(type, { data }));
    }
  }
}

class FakeDocument {
  visibilityState: DocumentVisibilityState = "visible";
  listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state;
    for (const listener of this.listeners) listener();
  }
}

let doc: FakeDocument;

function createStream() {
  return createEventStream({
    createEventSource: (url) => new FakeEventSource(url),
    document: doc as unknown as Document,
  });
}

const flush = () => new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
const current = () => FakeEventSource.instances.at(-1)!;

beforeEach(() => {
  FakeEventSource.instances = [];
  doc = new FakeDocument();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("event stream", () => {
  it("opens one connection for every subscriber of the same topics", async () => {
    const stream = createStream();
    stream.subscribe("config", () => {});
    stream.subscribe("config", () => {});
    await flush();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(current().url).toBe("/api/events?topics=config");
  });

  it("reconnects with the union of topics as subscribers come and go", async () => {
    const stream = createStream();
    stream.subscribe("config", () => {});
    await flush();
    const stopMetrics = stream.subscribe("metrics", () => {});
    await flush();

    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(current().url).toBe("/api/events?topics=config,metrics");

    stopMetrics();
    await flush();
    expect(current().url).toBe("/api/events?topics=config");
  });

  it("settles a subscribe and unsubscribe in the same tick into no reconnect", async () => {
    const stream = createStream();
    stream.subscribe("config", () => {});
    await flush();

    const stop = stream.subscribe("metrics", () => {});
    stop();
    await flush();

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("routes events to their topic's listeners and ignores malformed data", async () => {
    const stream = createStream();
    const onConfig = vi.fn();
    const onMetrics = vi.fn();
    stream.subscribe("config", onConfig);
    stream.subscribe("metrics", onMetrics);
    await flush();

    current().emit("config.changed", JSON.stringify({ type: "config.changed", scope: "layout" }));
    current().emit("metrics", "{broken");

    expect(onConfig).toHaveBeenCalledWith({ type: "config.changed", scope: "layout" });
    expect(onMetrics).not.toHaveBeenCalled();
  });

  it("reports connection state", async () => {
    const stream = createStream();
    const onConnection = vi.fn();
    const stop = stream.onConnection(onConnection);
    stream.subscribe("config", () => {});
    await flush();

    current().onopen?.(new Event("open"));
    current().onerror?.(new Event("error"));
    expect(onConnection.mock.calls).toEqual([["open"], ["error"]]);

    stop();
    current().onopen?.(new Event("open"));
    expect(onConnection).toHaveBeenCalledTimes(2);
  });

  it("closes while hidden and resumes when visible", async () => {
    const stream = createStream();
    const onConnection = vi.fn();
    stream.onConnection(onConnection);
    stream.subscribe("config", () => {});
    await flush();

    doc.setVisibility("hidden");
    expect(current().closed).toBe(true);

    doc.setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(current().closed).toBe(false);
    expect(onConnection).toHaveBeenCalledWith("resumed");
  });

  it("doesn't connect while hidden, and closes when the last subscriber leaves", async () => {
    doc.visibilityState = "hidden";
    const stream = createStream();
    const stop = stream.subscribe("config", () => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(0);

    doc.setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(1);

    stop();
    await flush();
    expect(current().closed).toBe(true);
    expect(doc.listeners.size).toBe(0);
  });
});
