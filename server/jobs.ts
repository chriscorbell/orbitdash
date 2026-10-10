import { logJobFailure } from "./observability";

interface ScheduledJob {
  interval: ReturnType<typeof setInterval> | null;
  timeout: ReturnType<typeof setTimeout> | null;
}

const jobs = new Map<string, ScheduledJob>();

export interface ScheduleJobOptions {
  /** Delay before the first run; defaults to one interval. */
  initialDelayMs?: number;
  intervalMs: number;
}

async function runJob(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logJobFailure(name, error);
  }
}

/**
 * Runs `run` on a fixed interval. Timers are unref'd so background jobs never keep the process
 * alive on their own, and failures are logged instead of crashing the server.
 */
export function scheduleJob(
  name: string,
  run: () => void | Promise<void>,
  { initialDelayMs, intervalMs }: ScheduleJobOptions
): void {
  cancelJob(name);

  const job: ScheduledJob = { interval: null, timeout: null };
  job.timeout = setTimeout(() => {
    job.timeout = null;
    void runJob(name, run);
    job.interval = setInterval(() => void runJob(name, run), intervalMs);
    job.interval.unref?.();
  }, initialDelayMs ?? intervalMs);
  job.timeout.unref?.();

  jobs.set(name, job);
}

export function cancelJob(name: string): void {
  const job = jobs.get(name);
  if (!job) {
    return;
  }

  if (job.timeout) clearTimeout(job.timeout);
  if (job.interval) clearInterval(job.interval);
  jobs.delete(name);
}

export function cancelAllJobs(): void {
  for (const name of [...jobs.keys()]) {
    cancelJob(name);
  }
}

export function getScheduledJobNames(): string[] {
  return [...jobs.keys()];
}
