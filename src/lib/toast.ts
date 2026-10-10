import { useSyncExternalStore } from "react";

export type ToastTone = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  description?: string;
  /** Milliseconds before the toast closes on its own; errors and toasts with actions stay longer. */
  durationMs?: number;
  title: string;
  tone?: ToastTone;
}

export interface ToastItem extends ToastOptions {
  durationMs: number;
  id: string;
  tone: ToastTone;
}

const MAX_TOASTS = 4;
const listeners = new Set<() => void>();
let toasts: ToastItem[] = [];
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function defaultDuration(options: ToastOptions): number {
  if (options.action) return 8_000;
  if (options.tone === "error") return 7_000;
  return 4_000;
}

/** Shows a toast and returns its id. Only the newest few are kept on screen. */
export function toast(options: ToastOptions): string {
  const id = `toast-${++counter}`;
  const item: ToastItem = {
    ...options,
    durationMs: options.durationMs ?? defaultDuration(options),
    id,
    tone: options.tone ?? "default",
  };
  toasts = [...toasts, item].slice(-MAX_TOASTS);
  emit();
  return id;
}

export function dismissToast(id: string): void {
  const next = toasts.filter((item) => item.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

/** Shows an error toast for a failed action, using the error's message when it has one. */
export function toastError(error: unknown, fallback: string): string {
  return toast({
    title: fallback,
    description: error instanceof Error && error.message !== fallback ? error.message : undefined,
    tone: "error",
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetToastsForTesting(): void {
  toasts = [];
  counter = 0;
  emit();
}
