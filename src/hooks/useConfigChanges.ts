import { useEffect, useRef } from "react";
import { eventStream, type EventStream } from "@/lib/live/event-stream";
import { TAB_ID } from "@/lib/tab-id";
import type { ConfigScope } from "@shared/events";

/**
 * Calls `onChange` when another tab or device changes data in one of `scopes`, and when this tab
 * returns from the background (it may have missed changes while hidden).
 */
export function useConfigChanges(
  scopes: readonly Exclude<ConfigScope, "all">[],
  onChange: () => void,
  stream: EventStream = eventStream
) {
  const onChangeRef = useRef(onChange);
  const scopesKey = scopes.join(",");

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const watched = new Set<string>(scopesKey.split(","));
    const stopConfig = stream.subscribe("config", (event) => {
      if (event.origin === TAB_ID) return;
      if (event.scope === "all" || watched.has(event.scope)) {
        onChangeRef.current();
      }
    });
    const stopConnection = stream.onConnection((connection) => {
      if (connection === "resumed") onChangeRef.current();
    });

    return () => {
      stopConfig();
      stopConnection();
    };
  }, [scopesKey, stream]);
}
