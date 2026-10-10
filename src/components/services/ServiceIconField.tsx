import { useState, type ChangeEventHandler, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconLibraryPanel, IconSuggestions } from "@/components/services/IconLibraryPicker";
import { LibraryBig, Upload, X } from "lucide-react";

// Matches the formats the server detects; .ico is listed by extension because browsers disagree
// on its MIME type.
const ACCEPTED_ICON_TYPES = [
  "image/png",
  "image/svg+xml",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  ".ico",
].join(",");

interface ServiceIconFieldProps {
  fileInputId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  iconPreview: string | null;
  iconSourceUrl: string | null;
  iconUrl: string;
  iconUrlInputId: string;
  onIconChange: ChangeEventHandler<HTMLInputElement>;
  onIconUrlChange: (value: string) => void;
  onRemoveIcon: () => void;
  /** The service's name, used to suggest library icons. */
  serviceName?: string;
  /** The icon the service's own page links to, if reading it found one. */
  siteIconUrl?: string | null;
}

export function ServiceIconField({
  fileInputId,
  fileInputRef,
  iconPreview,
  iconSourceUrl,
  iconUrl,
  iconUrlInputId,
  onIconChange,
  onIconUrlChange,
  onRemoveIcon,
  serviceName = "",
  siteIconUrl = null,
}: ServiceIconFieldProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const pickFromLibrary = (url: string) => {
    onIconUrlChange(url);
    setLibraryOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="font-semibold">Icon</Label>
      <div className="flex flex-wrap items-center gap-3">
        {iconPreview && (
          <div className="relative h-10 w-10 rounded-md border border-border bg-muted">
            <img
              src={iconPreview}
              alt="Icon preview"
              className="h-full w-full object-contain p-1"
            />
            <button
              type="button"
              aria-label="Remove icon"
              onClick={onRemoveIcon}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white hover:bg-destructive/80"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Upload icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {iconPreview ? "Change" : "Upload"}
        </Button>
        <Button
          type="button"
          variant={libraryOpen ? "secondary" : "outline"}
          size="sm"
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen((open) => !open)}
        >
          <LibraryBig className="mr-1.5 h-3.5 w-3.5" />
          Library
        </Button>
        <Label htmlFor={fileInputId} className="sr-only">
          Upload icon file
        </Label>
        <input
          id={fileInputId}
          name="iconFile"
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ICON_TYPES}
          onChange={onIconChange}
          aria-label="Upload icon file"
          autoComplete="off"
          className="hidden"
        />
        <Label htmlFor={iconUrlInputId} className="sr-only">
          Icon URL
        </Label>
        <Input
          id={iconUrlInputId}
          name="iconUrl"
          type="url"
          autoComplete="url"
          value={iconUrl}
          onChange={(event) => onIconUrlChange(event.target.value)}
          placeholder="https://example.com/icon.png"
          className="min-w-48 flex-1 font-normal"
        />
      </div>
      {iconSourceUrl && (
        <p className="truncate text-xs text-muted-foreground">
          Downloaded from{" "}
          <a
            href={iconSourceUrl}
            target="_blank"
            rel="noreferrer"
            title={iconSourceUrl}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {iconSourceUrl}
          </a>
        </p>
      )}
      {libraryOpen ? (
        <IconLibraryPanel
          initialQuery={serviceName}
          selectedUrl={iconUrl.trim()}
          onSelect={pickFromLibrary}
        />
      ) : (
        !iconPreview &&
        (serviceName.trim().length >= 2 || siteIconUrl) && (
          <IconSuggestions
            name={serviceName}
            siteIconUrl={siteIconUrl}
            selectedUrl={iconUrl.trim()}
            onSelect={onIconUrlChange}
          />
        )
      )}
      <p className="text-xs text-muted-foreground">
        Pick one from the library, upload a PNG, SVG, JPG, GIF, WebP or ICO, or paste a link to one.
      </p>
    </div>
  );
}
