import type { AlertMetric, AlertRule } from "./types";

export const ALERT_METRICS: readonly AlertMetric[] = ["cpu", "memory", "disk", "temperature"];

/** Allowed thresholds per metric: percentages, or °C for temperature. */
export const ALERT_THRESHOLD_RANGE: Record<AlertMetric, { min: number; max: number }> = {
  cpu: { min: 1, max: 100 },
  memory: { min: 1, max: 100 },
  disk: { min: 1, max: 100 },
  temperature: { min: 30, max: 120 },
};

export const ALERT_DURATIONS_SEC = [0, 60, 120, 300, 600, 900, 1800, 3600] as const;

/** How far a value must fall below the threshold to resolve, so readings near it don't flap. */
export const ALERT_HYSTERESIS: Record<AlertMetric, number> = {
  cpu: 3,
  memory: 3,
  disk: 1,
  temperature: 3,
};

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { metric: "cpu", enabled: true, threshold: 90, durationSec: 300 },
  { metric: "memory", enabled: true, threshold: 90, durationSec: 300 },
  { metric: "disk", enabled: true, threshold: 85, durationSec: 60 },
  { metric: "temperature", enabled: true, threshold: 85, durationSec: 120 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidAlertRule(value: unknown): value is AlertRule {
  if (!isRecord(value)) return false;
  const metric = value.metric as AlertMetric;
  if (!ALERT_METRICS.includes(metric)) return false;
  const range = ALERT_THRESHOLD_RANGE[metric];
  return (
    typeof value.enabled === "boolean" &&
    typeof value.threshold === "number" &&
    Number.isFinite(value.threshold) &&
    value.threshold >= range.min &&
    value.threshold <= range.max &&
    (ALERT_DURATIONS_SEC as readonly unknown[]).includes(value.durationSec)
  );
}

/**
 * Stored rules read leniently: one rule per metric in a fixed order, each valid stored rule
 * replacing its default, so a damaged or older document still yields a full set.
 */
export function parseAlertRules(input: unknown): AlertRule[] {
  const stored = Array.isArray(input) ? input.filter(isValidAlertRule) : [];
  return DEFAULT_ALERT_RULES.map(
    (fallback) => stored.find((rule) => rule.metric === fallback.metric) ?? fallback
  ).map((rule) => ({
    metric: rule.metric,
    enabled: rule.enabled,
    threshold: rule.threshold,
    durationSec: rule.durationSec,
  }));
}

const METRIC_LABELS: Record<AlertMetric, string> = {
  cpu: "CPU",
  memory: "Memory",
  disk: "Disk",
  temperature: "CPU temperature",
};

export function formatAlertValue(metric: AlertMetric, value: number): string {
  return metric === "temperature" ? `${Math.round(value)}°C` : `${Math.round(value)}%`;
}

export function formatAlertDuration(durationSec: number): string {
  if (durationSec === 0) return "";
  if (durationSec < 3600) return `${durationSec / 60} min`;
  return "1 hour";
}

/** "CPU above 90% for 5 min", "Disk (/srv) above 85%". */
export function describeAlert(alert: {
  metric: AlertMetric;
  subject: string | null;
  threshold: number;
  durationSec: number;
}): string {
  const label = alert.subject
    ? `${METRIC_LABELS[alert.metric]} (${alert.subject})`
    : METRIC_LABELS[alert.metric];
  const duration = formatAlertDuration(alert.durationSec);
  return `${label} above ${formatAlertValue(alert.metric, alert.threshold)}${duration ? ` for ${duration}` : ""}`;
}

export function alertMetricLabel(metric: AlertMetric): string {
  return METRIC_LABELS[metric];
}
