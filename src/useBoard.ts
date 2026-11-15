import { useCallback, useEffect, useRef, useState } from "react";
import type { Board } from "../shared/types.ts";
import { api } from "./api.ts";

/**
 * The board, loaded on start and again whenever the tab becomes visible, so a change made in
 * another browser shows up when you come back to this one.
 */
export function useBoard() {
  const [board, setBoardState] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every write bumps this; a reload that started before a newer write throws its answer away.
  const version = useRef(0);

  const setBoard = useCallback((next: Board) => {
    version.current += 1;
    setBoardState(next);
  }, []);

  const reload = useCallback(async () => {
    const started = version.current;
    try {
      const next = await api.board();
      if (version.current === started) setBoard(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [setBoard]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { board, error, setBoard, reload };
}
