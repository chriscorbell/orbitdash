import { useEffect, useState } from "react";
import { wallpaperUrl } from "@/lib/api/wallpapers";
import type { DashboardAppearanceSettings } from "@shared/dashboard-settings";

type WallpaperProps = Pick<
  DashboardAppearanceSettings,
  "wallpaper" | "wallpaperBlur" | "wallpaperDim"
>;

/**
 * The background image behind the whole page, blurred and dimmed toward the theme's background so
 * text stays readable. While one is shown, surfaces turn slightly translucent (see index.css).
 */
export function Wallpaper({ wallpaper, wallpaperBlur, wallpaperDim }: WallpaperProps) {
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (wallpaper) root.dataset.wallpaper = "";
    else delete root.dataset.wallpaper;
    return () => {
      delete root.dataset.wallpaper;
    };
  }, [wallpaper]);

  if (!wallpaper) return null;

  // Blur pulls in transparent edges, so the image grows a little to keep them off screen.
  const scale = wallpaperBlur > 0 ? 1.04 + wallpaperBlur / 400 : 1;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        key={wallpaper}
        src={wallpaperUrl(wallpaper)}
        alt=""
        decoding="async"
        onLoad={() => setLoaded(wallpaper)}
        className="absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-700 ease-out motion-reduce:transition-none"
        style={{
          filter: wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : undefined,
          opacity: loaded === wallpaper ? 1 : 0,
          transform: `scale(${scale})`,
        }}
      />
      <div
        className="absolute inset-0 transition-[background-color] duration-300"
        style={{
          backgroundColor: `color-mix(in oklab, var(--background) ${wallpaperDim}%, transparent)`,
        }}
      />
    </div>
  );
}
