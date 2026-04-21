import type { ChangeEventHandler, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";

interface ServiceIconFieldProps {
  fileInputId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  iconPreview: string | null;
  iconUrl: string;
  iconUrlInputId: string;
  onIconChange: ChangeEventHandler<HTMLInputElement>;
  onIconUrlChange: (value: string) => void;
  onRemoveIcon: () => void;
}

export function ServiceIconField({
  fileInputId,
  fileInputRef,
  iconPreview,
  iconUrl,
  iconUrlInputId,
  onIconChange,
  onIconUrlChange,
  onRemoveIcon,
}: ServiceIconFieldProps) {
  return (
    <div className="space-y-2">
      <Label className="font-semibold">Icon (PNG/SVG)</Label>
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
        <Label htmlFor={fileInputId} className="sr-only">
          Upload icon file
        </Label>
        <input
          id={fileInputId}
          name="iconFile"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/svg+xml"
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
      <p className="text-xs text-muted-foreground">
        Upload or enter a URL to a PNG or SVG icon.
        <br />
        Browse{" "}
        <a
          href="https://dashboardicons.com/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          dashboardicons.com
        </a>{" "}
        to find icons.
      </p>
    </div>
  );
}
