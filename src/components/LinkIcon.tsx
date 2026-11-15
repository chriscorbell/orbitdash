import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { getCachedIconTone, measureIconTone, type IconTone } from "../lib/icon-tone.ts";

/** A link's icon in a fixed square. Icons too dark for the dark page sit on a light plate. */
export function LinkIcon({ src, large = false }: { src: string | null; large?: boolean }) {
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

  return (
    <span className="link-icon" data-large={large || undefined} data-tone={tone}>
      {src ? <img src={src} alt="" draggable={false} /> : <Globe aria-hidden="true" />}
    </span>
  );
}
