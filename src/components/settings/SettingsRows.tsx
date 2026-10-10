import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LucideIcon } from "lucide-react";

interface SettingsToggleRowProps {
  checked: boolean;
  description: string;
  id: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}

export function SettingsToggleRow({
  checked,
  description,
  id,
  title,
  onCheckedChange,
}: SettingsToggleRowProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{title}</Label>
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SettingsChoiceRowProps<T extends string> {
  description: string;
  id: string;
  options: readonly ChoiceOption<T>[];
  title: string;
  value: T;
  onChange: (value: T) => void;
}

/** A labelled radio group of segmented buttons; arrow keys move the choice like native radios. */
export function SettingsChoiceRow<T extends string>({
  description,
  id,
  options,
  title,
  value,
  onChange,
}: SettingsChoiceRowProps<T>) {
  const labelId = `${id}-label`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const next = (current + step + options.length) % options.length;
    onChange(options[next].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label id={labelId}>{title}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid auto-cols-fr grid-flow-col gap-2"
        onKeyDown={handleKeyDown}
      >
        {options.map((option) => {
          const checked = option.value === value;
          const Icon = option.icon;
          return (
            <Button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              variant={checked ? "outline" : "ghost"}
              size="sm"
              className="w-full"
              onClick={() => onChange(option.value)}
            >
              {Icon && <Icon aria-hidden="true" />}
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-muted-foreground text-xs font-medium">{children}</h3>;
}
