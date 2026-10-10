import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAlerts } from "@/hooks/useAlerts";
import { toastError } from "@/lib/toast";
import {
  ALERT_DURATIONS_SEC,
  ALERT_THRESHOLD_RANGE,
  alertMetricLabel,
  formatAlertDuration,
} from "@shared/alerts";
import type { AlertRule } from "@shared/types";

const DESCRIPTIONS: Record<AlertRule["metric"], string> = {
  cpu: "Total CPU usage",
  memory: "Memory in use",
  disk: "Any mounted filesystem",
  temperature: "CPU package temperature",
};

/** One row per metric: on or off, the threshold, and how long it must last before firing. */
export function AlertSettings() {
  const { rules, updateRules } = useAlerts();

  const save = (rule: AlertRule) => {
    updateRules([rule]).catch((error) => toastError(error, "Couldn't save the alert"));
  };

  if (rules.length === 0) return null;
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {rules.map((rule) => (
        <AlertRuleRow key={rule.metric} rule={rule} onChange={save} />
      ))}
    </div>
  );
}

function AlertRuleRow({
  rule,
  onChange,
}: {
  rule: AlertRule;
  onChange: (rule: AlertRule) => void;
}) {
  const range = ALERT_THRESHOLD_RANGE[rule.metric];
  const unit = rule.metric === "temperature" ? "°C" : "%";
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const id = `alert-${rule.metric}`;

  const commitThreshold = () => {
    const value = Math.round(Number(threshold));
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      setThreshold(String(rule.threshold));
      return;
    }
    setThreshold(String(value));
    if (value !== rule.threshold) onChange({ ...rule, threshold: value });
  };

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={id}>{alertMetricLabel(rule.metric)}</Label>
          <p className="text-muted-foreground text-sm">{DESCRIPTIONS[rule.metric]}</p>
        </div>
        <Switch
          id={id}
          checked={rule.enabled}
          onCheckedChange={(enabled) => onChange({ ...rule, enabled })}
        />
      </div>
      {rule.enabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground animate-in fade-in-0 duration-200">
          <span>Above</span>
          <div className="relative w-20">
            <Input
              type="number"
              inputMode="numeric"
              min={range.min}
              max={range.max}
              aria-label={`${alertMetricLabel(rule.metric)} threshold`}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              onBlur={commitThreshold}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitThreshold();
                }
              }}
              className="pr-7 font-mono tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
              {unit}
            </span>
          </div>
          <span>for</span>
          <Select
            value={String(rule.durationSec)}
            onValueChange={(value) => onChange({ ...rule, durationSec: Number(value) })}
          >
            <SelectTrigger
              aria-label={`${alertMetricLabel(rule.metric)} duration`}
              className="h-8 w-28"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALERT_DURATIONS_SEC.map((duration) => (
                <SelectItem key={duration} value={String(duration)}>
                  {duration === 0 ? "any time" : formatAlertDuration(duration)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
