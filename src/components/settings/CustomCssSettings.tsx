import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_CSS_MAX_LENGTH } from "@shared/dashboard-settings";

interface CustomCssSettingsProps {
  customCss: string;
  onChange: (customCss: string) => void;
}

/** Free-form CSS for power users, applied after the app's own styles once saved. */
export function CustomCssSettings({ customCss, onChange }: CustomCssSettingsProps) {
  const [draft, setDraft] = useState(customCss);
  const dirty = draft !== customCss;

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label htmlFor="custom-css">Custom CSS</Label>
        <p id="custom-css-description" className="text-muted-foreground text-sm">
          Applied after the app&apos;s styles
        </p>
      </div>
      <Textarea
        id="custom-css"
        value={draft}
        rows={5}
        spellCheck={false}
        maxLength={CUSTOM_CSS_MAX_LENGTH}
        placeholder={'[data-slot="card"] {\n  border-radius: 6px;\n}'}
        aria-describedby="custom-css-description"
        className="max-h-64 font-mono text-xs"
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        {customCss && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
          >
            Clear
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!dirty}
          onClick={() => onChange(draft)}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
