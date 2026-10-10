import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSystemInfo } from "@/lib/api/system";
import { formatUptime } from "@/lib/format";

/** Re-renders on each new minute, aligned to the clock, rather than every second. */
function useMinuteTicker(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setNow(Date.now());
        interval = setInterval(() => setNow(Date.now()), 60_000);
      },
      60_000 - (Date.now() % 60_000)
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return now;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** Host name and uptime, then the time; uptime advances locally between fetches. */
export function HeaderStatus() {
  const now = useMinuteTicker();
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["system"],
    queryFn: fetchSystemInfo,
    staleTime: 10 * 60_000,
  });

  const uptime = data ? data.uptimeSeconds + Math.max(0, (now - dataUpdatedAt) / 1000) : null;

  return (
    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
      {uptime !== null && (
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 md:inline-flex"
          title={
            data?.hostname ? `${data.hostname} has been up for ${formatUptime(uptime)}` : undefined
          }
        >
          {data?.hostname && <span className="text-foreground">{data.hostname}</span>}
          <span>up {formatUptime(uptime)}</span>
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
