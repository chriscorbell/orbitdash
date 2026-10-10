import { ALERT_HYSTERESIS } from "@shared/alerts";
import type { AlertMetric, AlertRule, HostSnapshot, MetricAlert } from "@shared/types";

export interface Reading {
  metric: AlertMetric;
  subject: string | null;
  value: number;
}

/** The values each rule watches in one snapshot; metrics the host doesn't report are skipped. */
export function readingsFromSnapshot(snapshot: HostSnapshot): Reading[] {
  const readings: Reading[] = [];
  if (snapshot.cpu.usage !== null) {
    readings.push({ metric: "cpu", subject: null, value: snapshot.cpu.usage });
  }
  if (snapshot.memory && snapshot.memory.totalBytes > 0) {
    readings.push({
      metric: "memory",
      subject: null,
      value: (snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100,
    });
  }
  if (snapshot.cpu.temperatureCelsius !== null) {
    readings.push({ metric: "temperature", subject: null, value: snapshot.cpu.temperatureCelsius });
  }
  for (const filesystem of snapshot.filesystems) {
    if (filesystem.totalBytes > 0) {
      readings.push({
        metric: "disk",
        subject: filesystem.mountpoint,
        value: (filesystem.usedBytes / filesystem.totalBytes) * 100,
      });
    }
  }
  return readings;
}

export interface AlertEvaluatorOptions {
  createId: () => string;
  /** Called when an alert starts firing, and again when it resolves. */
  onChange: (alert: MetricAlert) => void;
}

interface Breach {
  since: number;
  peak: number;
}

const keyOf = (metric: AlertMetric, subject: string | null) => `${metric}:${subject ?? ""}`;

/**
 * Watches readings against rules. A breach must last the rule's duration before it fires, and an
 * alert resolves once the value falls a little below the threshold (or its filesystem goes away).
 */
export function createAlertEvaluator({ createId, onChange }: AlertEvaluatorOptions) {
  let rules: AlertRule[] = [];
  const breaches = new Map<string, Breach>();
  const active = new Map<string, MetricAlert>();

  function resolve(key: string, now: number) {
    const alert = active.get(key);
    if (!alert) return;
    active.delete(key);
    const resolved = { ...alert, resolvedAt: now };
    onChange(resolved);
  }

  return {
    setRules(next: AlertRule[], now: number) {
      rules = next;
      // Changed or disabled rules start over; still-breached values fire again after the duration.
      for (const key of [...active.keys()]) resolve(key, now);
      breaches.clear();
    },

    observe(readings: Reading[], now: number) {
      const seen = new Set<string>();
      for (const rule of rules) {
        if (!rule.enabled) continue;
        for (const reading of readings) {
          if (reading.metric !== rule.metric) continue;
          const key = keyOf(reading.metric, reading.subject);
          seen.add(key);
          const firing = active.get(key);

          if (reading.value > rule.threshold) {
            const breach = breaches.get(key) ?? { since: now, peak: reading.value };
            breach.peak = Math.max(breach.peak, reading.value);
            breaches.set(key, breach);
            if (firing) {
              firing.value = reading.value;
              firing.peak = Math.max(firing.peak, reading.value);
            } else if (now - breach.since >= rule.durationSec * 1000) {
              const alert: MetricAlert = {
                id: createId(),
                metric: rule.metric,
                subject: reading.subject,
                threshold: rule.threshold,
                durationSec: rule.durationSec,
                value: reading.value,
                peak: breach.peak,
                startedAt: breach.since,
                firedAt: now,
                resolvedAt: null,
              };
              active.set(key, alert);
              onChange(alert);
            }
            continue;
          }

          breaches.delete(key);
          if (firing) {
            firing.value = reading.value;
            if (reading.value <= rule.threshold - ALERT_HYSTERESIS[rule.metric]) resolve(key, now);
          }
        }
      }
      // A filesystem that was unmounted, or a metric the host stopped reporting.
      for (const key of [...active.keys()]) {
        if (!seen.has(key)) resolve(key, now);
      }
      for (const key of [...breaches.keys()]) {
        if (!seen.has(key)) breaches.delete(key);
      }
    },

    activeAlerts(): MetricAlert[] {
      return [...active.values()]
        .map((alert) => ({ ...alert }))
        .sort((left, right) => left.firedAt - right.firedAt);
    },
  };
}

export type AlertEvaluator = ReturnType<typeof createAlertEvaluator>;
