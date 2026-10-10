import { Check, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TestState = { sending: true } | { sending: false; ok: boolean; error: string | null };

/** How a test went, in one line under whatever sent it. */
export function TestResultLine({ state }: { state: TestState }) {
  if (state.sending) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
        Sending a test…
      </p>
    );
  }
  const Icon = state.ok ? Check : CircleAlert;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs animate-in fade-in-0 duration-200 motion-reduce:animate-none",
        state.ok ? "text-success" : "text-destructive"
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0">{state.ok ? "Test sent" : (state.error ?? "Test failed")}</span>
    </p>
  );
}
