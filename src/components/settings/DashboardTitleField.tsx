import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TITLE_MAX_LENGTH } from "@shared/dashboard-settings";

interface DashboardTitleFieldProps {
  title: string;
  onChange: (title: string) => void;
}

/** The dashboard's name for the header and browser tab; saves when the field is left. */
export function DashboardTitleField({ title, onChange }: DashboardTitleFieldProps) {
  const [draft, setDraft] = useState(title);

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== title) onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label htmlFor="dashboard-title">Dashboard name</Label>
      <Input
        id="dashboard-title"
        value={draft}
        placeholder="orbitdash"
        maxLength={TITLE_MAX_LENGTH}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}
