import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const DURATION_MS = 260;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FLIP_ID = "orbitdash-flip";

/**
 * Animates elements marked with `data-flip-key` from where they were to where they are after a
 * render (FLIP), using transforms only. Positions are measured relative to the container, so
 * scrolling between renders does not count as movement. Attach the returned ref to the container.
 */
export function useFlipAnimation<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());

  // Runs after every commit, before paint.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const origin = container.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const animate = !prefersReducedMotion() && typeof Element.prototype.animate === "function";

    for (const element of container.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = element.dataset.flipKey!;
      // Where it shows now, which includes any of our animations still running...
      const visual = element.getBoundingClientRect();
      const running = element.getAnimations?.().filter((item) => item.id === FLIP_ID) ?? [];
      running.forEach((item) => item.cancel());
      // ...and where layout actually put it. Measuring this with an animation running would
      // record a moving position and set off new animations on every render.
      const rect = running.length > 0 ? element.getBoundingClientRect() : visual;
      const position = { x: rect.left - origin.left, y: rect.top - origin.top };
      next.set(key, position);

      const previous = positions.current.get(key);
      if (!animate || !previous) continue;
      // Start from where it appeared before this render: its old spot plus any offset it had.
      const dx = previous.x + (visual.left - rect.left) - position.x;
      const dy = previous.y + (visual.top - rect.top) - position.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: DURATION_MS, easing: EASING, id: FLIP_ID }
      );
    }

    positions.current = next;
  });

  return containerRef;
}
