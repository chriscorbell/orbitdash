import { Globe } from "lucide-react";
import { useIconTone } from "../useIconTone.ts";

/** A link's icon in a fixed square. Icons too dark for the dark page are drawn in reverse. */
export function LinkIcon({ src, large = false }: { src: string | null; large?: boolean }) {
  const tone = useIconTone(src);
  return (
    <span className="link-icon" data-large={large || undefined} data-tone={tone}>
      {src ? <img src={src} alt="" draggable={false} /> : <Globe aria-hidden="true" />}
    </span>
  );
}
