import { useEffect, useState } from "react";
import { getCachedIconTone, measureIconTone, type IconTone } from "./lib/icon-tone.ts";

/** An icon's tone, from the cache on first paint or measured once it has loaded. */
export function useIconTone(src: string | null): IconTone | undefined {
  const [measured, setMeasured] = useState<{ src: string; tone: IconTone } | null>(null);
  const tone = src
    ? (getCachedIconTone(src) ?? (measured?.src === src ? measured.tone : undefined))
    : undefined;

  useEffect(() => {
    if (!src || tone) return;
    let active = true;
    void measureIconTone(src).then((result) => {
      if (active) setMeasured({ src, tone: result });
    });
    return () => {
      active = false;
    };
  }, [src, tone]);

  return tone;
}
