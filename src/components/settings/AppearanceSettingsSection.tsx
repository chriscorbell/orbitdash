import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ACCENT_OPTIONS,
  type AccentPreset,
  type DashboardAppearanceSettings,
  type ThemePreference,
} from "@shared/dashboard-settings";

const THEMES: Array<{ value: ThemePreference; label: string; Icon: typeof Moon }> = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
];

const ACCENT_LABELS: Record<AccentPreset, string> = {
  amber: "Amber",
  graphite: "Graphite",
  ice: "Ice",
  mint: "Mint",
  rose: "Rose",
  violet: "Violet",
};

interface AppearanceSettingsSectionProps {
  appearance: DashboardAppearanceSettings;
  onChange: (appearance: Partial<DashboardAppearanceSettings>) => void;
}

export function AppearanceSettingsSection({
  appearance,
  onChange,
}: AppearanceSettingsSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-3">
      <div className="space-y-2">
        <Label id="theme-label">Theme</Label>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {THEMES.map(({ value, label, Icon }) => {
            const selected = appearance.theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ theme: value })}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                  selected
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label id="accent-label">Accent</Label>
        <div role="radiogroup" aria-labelledby="accent-label" className="flex flex-wrap gap-2.5">
          {ACCENT_OPTIONS.map((accent) => {
            const selected = appearance.accent === accent;
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={ACCENT_LABELS[accent]}
                title={ACCENT_LABELS[accent]}
                data-accent={accent}
                onClick={() => onChange({ accent })}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-foreground ring-offset-2 ring-offset-popover transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  selected && "ring-2 ring-foreground/70"
                )}
              >
                {selected && <Check aria-hidden="true" className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
