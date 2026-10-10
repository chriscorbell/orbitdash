import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Activity, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLatency, STATUS_LABEL } from "@/components/status/status-format";
import { testService, type ServiceTestInput } from "@/lib/api/service-tools";
import { cn } from "@/lib/utils";
import { normalizeServiceUrl } from "@shared/urls";
import type { ServiceInspection, ServiceTestResult } from "@shared/types";

interface ServiceUrlAssistProps {
  url: string;
  check: Omit<ServiceTestInput, "url">;
  inspecting: boolean;
  inspection: ServiceInspection | null;
}

const DOT: Record<ServiceTestResult["state"], string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

function describeResult(result: ServiceTestResult): string {
  const detail =
    result.state === "down"
      ? result.error
      : [
          result.latencyMs !== null ? formatLatency(result.latencyMs) : null,
          result.statusCode !== null ? `HTTP ${result.statusCode}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return detail ? `${STATUS_LABEL[result.state]} · ${detail}` : STATUS_LABEL[result.state];
}

/**
 * Under the URL field: the link as it will be saved, what reading its page found, and a Test
 * button that runs one status check with the form's settings before anything is saved.
 */
export function ServiceUrlAssist({ url, check, inspecting, inspection }: ServiceUrlAssistProps) {
  const normalized = normalizeServiceUrl(url);
  const [tested, setTested] = useState<{ key: string; result: ServiceTestResult } | null>(null);
  const test = useMutation({ mutationFn: testService });
  // A result describes one link and set of check settings; changing either clears it.
  const key = JSON.stringify([normalized, check]);
  const result = tested?.key === key ? tested.result : null;

  const runTest = () => {
    if (!normalized) return;
    test.mutate(
      { url: normalized, ...check },
      { onSuccess: (value) => setTested({ key, result: value }) }
    );
  };

  const notes = [
    normalized && normalized !== url.trim() ? (
      <span key="saved" className="flex min-w-0 gap-1">
        Saved as <span className="truncate font-mono text-foreground">{normalized}</span>
      </span>
    ) : null,
    !inspecting && inspection && !inspection.reachable ? (
      <span key="unreachable">
        Couldn't read the page{inspection.error ? `: ${inspection.error}` : ""}
      </span>
    ) : null,
    !inspecting && inspection?.selfSigned ? (
      <span key="tls">Uses a self-signed certificate</span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!normalized || test.isPending}
          onClick={runTest}
        >
          {test.isPending ? (
            <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          Test
        </Button>
        <span aria-live="polite" className="min-w-0 flex-1 text-xs text-muted-foreground">
          {test.error && !test.isPending ? (
            <span className="text-destructive">{test.error.message}</span>
          ) : result ? (
            <span className="flex min-w-0 items-center gap-1.5 animate-in fade-in-0 duration-200">
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 shrink-0 rounded-full", DOT[result.state])}
              />
              <span className="truncate" title={result.target}>
                {describeResult(result)}
              </span>
            </span>
          ) : inspecting ? (
            // Shown in this row, not on a line of its own, so nothing below moves.
            <span className="flex items-center gap-1.5">
              <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin" />
              Reading the page
            </span>
          ) : null}
        </span>
      </div>
      {notes.length > 0 && (
        <div aria-live="polite" className="space-y-0.5 text-xs text-muted-foreground">
          {notes}
        </div>
      )}
    </div>
  );
}
