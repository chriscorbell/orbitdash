import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that glides to each new value instead of jumping, for readouts that update every
 * second. Jumps straight there when reduced motion is preferred or there is nothing to tween from.
 */
export function useTweenedNumber(target: number | null, durationMs = 450): number | null {
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (target === null || from === null || reducedMotion || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const value = from + (target - from) * easeOutCubic(progress);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, reducedMotion, target]);

  return shown;
}
