// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import type { ConnectionEvent, EventStream } from "@/lib/live/event-stream";
import { TAB_ID } from "@/lib/tab-id";
import type { ConfigChangedEvent } from "@shared/events";

function createFakeStream() {
  let configListener: ((event: ConfigChangedEvent) => void) | null = null;
  let connectionListener: ((event: ConnectionEvent) => void) | null = null;
  const stream = {
    onConnection: (listener: (event: ConnectionEvent) => void) => {
      connectionListener = listener;
      return () => {
        connectionListener = null;
      };
    },
    subscribe: (_topic: string, listener: (event: ConfigChangedEvent) => void) => {
      configListener = listener;
      return () => {
        configListener = null;
      };
    },
  } as unknown as EventStream;

  return {
    stream,
    config: (scope: ConfigChangedEvent["scope"], origin: string | null = "other-tab") =>
      configListener?.({ type: "config.changed", scope, origin }),
    connection: (event: ConnectionEvent) => connectionListener?.(event),
    get subscribed() {
      return configListener !== null;
    },
  };
}

describe("useConfigChanges", () => {
  it("reacts to watched scopes and full imports from other tabs", () => {
    const fake = createFakeStream();
    const onChange = vi.fn();
    renderHook(() => useConfigChanges(["layout"], onChange, fake.stream));

    fake.config("layout");
    fake.config("all");
    fake.config("settings");

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores changes this tab made itself", () => {
    const fake = createFakeStream();
    const onChange = vi.fn();
    renderHook(() => useConfigChanges(["layout"], onChange, fake.stream));

    fake.config("layout", TAB_ID);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("refreshes after the tab comes back from the background", () => {
    const fake = createFakeStream();
    const onChange = vi.fn();
    renderHook(() => useConfigChanges(["settings"], onChange, fake.stream));

    fake.connection("open");
    fake.connection("resumed");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("always calls the latest callback and unsubscribes on unmount", () => {
    const fake = createFakeStream();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ callback }) => useConfigChanges(["layout"], callback, fake.stream),
      { initialProps: { callback: first } }
    );

    rerender({ callback: second });
    fake.config("layout");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unmount();
    expect(fake.subscribed).toBe(false);
  });
});
