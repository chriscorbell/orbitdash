import { useCallback, useLayoutEffect, useState } from "react";

/**
 * The width of an element, kept current with a ResizeObserver. Measured before the first paint so
 * layouts that depend on it do not visibly jump. Pass the returned ref to the element.
 */
export function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  // Ref callbacks run while React commits, so the first measurement lands before paint.
  const ref = useCallback((node: T | null) => {
    setElement(node);
    if (node) setWidth(node.clientWidth);
  }, []);

  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, width };
}
