import { useEffect, useState } from "react";
import { getCachedIconTone, measureIconTone, type IconTone } from "@/lib/icon-tone";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

interface ServiceIconProps {
  className?: string;
  name: string;
  src: string | null;
}

/**
 * A service's icon in a fixed square. Icons too dark for the dark theme, or too light for the light
 * one, sit on a contrasting plate (see `[data-icon-tone]` in index.css).
 */
export function ServiceIcon({ className, name, src }: ServiceIconProps) {
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
    <div
      data-icon-tone={tone}
      className={cn(
        "service-icon flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        className
      )}
    >
      {src ? (
        <img src={src} alt={name} draggable={false} className="h-full w-full object-contain" />
      ) : (
        <Globe aria-hidden="true" className="h-1/2 w-1/2 text-muted-foreground" />
      )}
    </div>
  );
}
