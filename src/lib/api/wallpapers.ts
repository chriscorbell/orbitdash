import { buildApiUrl, requestJson } from "@/lib/api/client";
import { wallpaperUploadSchema } from "@/lib/api/schemas";

/** Uploads an image; save the returned filename as the appearance wallpaper to use it. */
export async function uploadWallpaper(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const response = await requestJson(
    "/api/wallpapers",
    { method: "POST", body },
    "Failed to upload the wallpaper",
    wallpaperUploadSchema
  );
  return response.filename;
}

export function wallpaperUrl(filename: string): string {
  return buildApiUrl(`/api/wallpapers/${filename}`);
}
