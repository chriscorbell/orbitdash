import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSystemInfo } from "@/lib/api/system";
import { useMinuteTicker } from "@/hooks/useMinuteTicker";
import { timeFormatter } from "@/lib/clock";
import { formatUptime } from "@/lib/format";
import type { ClockFormat } from "@shared/dashboard-settings";

interface HeaderStatusProps {
  clockFormat?: ClockFormat;
  /** Header widgets (weather, next event), shown before the host. */
  children?: ReactNode;
}

/** Host name and uptime, then the time; uptime advances locally between fetches. */
export function HeaderStatus({ clockFormat = "auto", children }: HeaderStatusProps) {
  const now = useMinuteTicker();
  const timeFormat = useMemo(() => timeFormatter(clockFormat), [clockFormat]);
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["system"],
    queryFn: fetchSystemInfo,
    staleTime: 10 * 60_000,
  });

  const uptime = data ? data.uptimeSeconds + Math.max(0, (now - dataUpdatedAt) / 1000) : null;

  return (
    <div className="flex items-center gap-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {children}
      {uptime !== null && (
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 md:inline-flex"
          title={
            data?.hostname ? `${data.hostname} has been up for ${formatUptime(uptime)}` : undefined
          }
        >
          {data?.hostname && <span className="text-foreground">{data.hostname}</span>}
          {/* Header widgets need the room; the uptime stays in the tooltip. */}
          {(!children || !data?.hostname) && <span>up {formatUptime(uptime)}</span>}
        </span>
      )}
      <time
        className="hidden rounded-full border px-2.5 py-1 sm:inline-block"
        dateTime={new Date(now).toISOString()}
      >
        {timeFormat.format(now)}
      </time>
    </div>
  );
}
