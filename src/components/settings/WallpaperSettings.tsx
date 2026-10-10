import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadWallpaper, wallpaperUrl } from "@/lib/api/wallpapers";
import {
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  type DashboardAppearanceSettings,
} from "@shared/dashboard-settings";
import { ImageIcon, ImageUp, LoaderCircle, X } from "lucide-react";

type WallpaperFields = Pick<
  DashboardAppearanceSettings,
  "wallpaper" | "wallpaperBlur" | "wallpaperDim"
>;

interface WallpaperSettingsProps {
  appearance: WallpaperFields;
  onChange: (appearance: Partial<WallpaperFields>) => void;
  /** Shows a value on the page right away, before it is saved. */
  onPreview: (appearance: Partial<WallpaperFields> | null) => void;
}

const SAVE_DELAY_MS = 400;

/** Upload or remove a wallpaper and tune its blur and dimming, previewed live while dragging. */
export function WallpaperSettings({ appearance, onChange, onPreview }: WallpaperSettingsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sliders, setSliders] = useState({
    wallpaperBlur: appearance.wallpaperBlur,
    wallpaperDim: appearance.wallpaperDim,
  });
  const pending = useRef<Partial<WallpaperFields> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onChange, onPreview });
  useEffect(() => {
    callbacks.current = { onChange, onPreview };
  }, [onChange, onPreview]);

  // Saves once the slider settles, and when settings close.
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) callbacks.current.onChange(pending.current);
    pending.current = null;
  }, []);
  useEffect(
    () => () => {
      flush();
      callbacks.current.onPreview(null);
    },
    [flush]
  );

  const slide = (field: "wallpaperBlur" | "wallpaperDim", value: number) => {
    setSliders((current) => ({ ...current, [field]: value }));
    pending.current = { ...pending.current, [field]: value };
    onPreview(pending.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      onChange({ wallpaper: await uploadWallpaper(file) });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Failed to upload the wallpaper"
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Label id="wallpaper-label">Wallpaper</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {appearance.wallpaper ? (
            <img
              src={wallpaperUrl(appearance.wallpaper)}
              alt="Current wallpaper"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <LoaderCircle className="animate-spin" /> : <ImageUp />}
            {uploading ? "Uploading…" : appearance.wallpaper ? "Replace" : "Upload image"}
          </Button>
          {appearance.wallpaper && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange({ wallpaper: null })}
            >
              <X />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          aria-labelledby="wallpaper-label"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {appearance.wallpaper && (
        <div className="space-y-2.5">
          <WallpaperSlider
            label="Blur"
            max={WALLPAPER_BLUR_MAX}
            unit="px"
            value={sliders.wallpaperBlur}
            onChange={(value) => slide("wallpaperBlur", value)}
          />
          <WallpaperSlider
            label="Dim"
            max={WALLPAPER_DIM_MAX}
            unit="%"
            value={sliders.wallpaperDim}
            onChange={(value) => slide("wallpaperDim", value)}
          />
        </div>
      )}
    </div>
  );
}

function WallpaperSlider({
  label,
  max,
  unit,
  value,
  onChange,
}: {
  label: string;
  max: number;
  unit: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={`Wallpaper ${label.toLowerCase()}`}
        className="w-full accent-brand"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {value}
        {unit}
      </span>
    </label>
  );
}
