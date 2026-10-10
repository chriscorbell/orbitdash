import { useEffect, useState } from "react";

/** Re-renders on each new minute, aligned to the clock, rather than every second. */
export function useMinuteTicker(): number {
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
