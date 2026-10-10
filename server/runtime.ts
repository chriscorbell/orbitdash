import { parseAuthConfig, type AuthConfig } from "./auth/config";
import { configureAuth, getAuthConfig, purgeStaleSessions, resetAuth } from "./auth/service";
import { closeDb, getDataDir, getDb, initializeDb, isDbInitialized } from "./db";
import { metricHistory, nextFlushDelayMs } from "./history/recorder";
import { MINUTE_MS } from "./history/rollup";
import { cancelAllJobs, scheduleJob } from "./jobs";
import { startCollection, stopCollection } from "./metrics";
import { applySeedIfFresh } from "./importers/service";
import { writeLog } from "./observability";
import { runNightlySnapshotIfDue } from "./services/backup-schedule";
import { metricAlerts } from "./alerts/service";
import { purgeUnusedWallpapers } from "./services/wallpaper-storage";
import { purgeTrash } from "./services/service-trash";
import { cleanupOrphanIcons } from "./services/icon-storage";
import { statusMonitor } from "./status/monitor";

export interface InitializeServerOptions {
  /** Auth settings; read from the environment (ORBITDASH_AUTH and friends) when left out. */
  auth?: AuthConfig;
  cleanupIcons?: boolean;
  dataDir?: string;
  dbPath?: string;
  logStartup?: boolean;
  registerSignalHandlers?: boolean;
  startJobs?: boolean;
  startMetrics?: boolean;
  port?: number;
}

let runtimeInitialized = false;
let signalHandlersRegistered = false;

const HOUR_MS = 60 * 60 * 1000;

// A failed cleanup must never stop the server from starting; the orphans just wait for next time.
function runIconCleanup() {
  try {
    const removed = cleanupOrphanIcons();
    if (removed > 0) {
      writeLog("info", "icons.cleanup", { removed });
    }
  } catch (error) {
    writeLog("error", "icons.cleanup_failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}

function startBackgroundJobs() {
  // Checked hourly so a server that restarts often still gets one snapshot a day.
  scheduleJob("nightly-snapshot", () => void runNightlySnapshotIfDue(), {
    initialDelayMs: 60_000,
    intervalMs: HOUR_MS,
  });
  scheduleJob("purge-trash", () => void purgeTrash(), {
    initialDelayMs: 30_000,
    intervalMs: 5 * 60 * 1000,
  });
  scheduleJob("prune-alerts", () => void metricAlerts.prune(), {
    initialDelayMs: 10 * 60 * 1000,
    intervalMs: HOUR_MS,
  });
  scheduleJob("purge-unused-wallpapers", () => void purgeUnusedWallpapers(), {
    initialDelayMs: 5 * 60 * 1000,
    intervalMs: HOUR_MS,
  });
  // One transaction a minute, just after each minute ends.
  scheduleJob("flush-metric-history", () => void metricHistory.flush(Date.now()), {
    initialDelayMs: nextFlushDelayMs(Date.now()),
    intervalMs: MINUTE_MS,
  });
  scheduleJob("prune-metric-history", () => void metricHistory.prune(Date.now()), {
    initialDelayMs: 2 * MINUTE_MS,
    intervalMs: HOUR_MS,
  });
  // Status checks: each tick starts the checks that are due (see server/status/scheduler.ts).
  // Like icon cleanup, a failure here must never stop the server from starting.
  try {
    statusMonitor.start();
  } catch (error) {
    writeLog("error", "status.start_failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
  scheduleJob("status-checks", () => statusMonitor.tick(), {
    initialDelayMs: 1_000,
    intervalMs: 1_000,
  });
  scheduleJob("prune-status-history", () => void statusMonitor.prune(Date.now()), {
    initialDelayMs: 3 * MINUTE_MS,
    intervalMs: HOUR_MS,
  });
  scheduleJob("purge-sessions", () => void purgeStaleSessions(Date.now()), {
    initialDelayMs: 3 * MINUTE_MS,
    intervalMs: HOUR_MS,
  });
}

function logAuthMode() {
  const { guest, mode, proxyHeader, sessionTtlMs, trustedProxies } = getAuthConfig();
  writeLog("info", "auth.configured", {
    mode,
    ...(mode === "none" ? {} : { guest }),
    ...(mode === "password" ? { sessionDays: sessionTtlMs / (24 * HOUR_MS) } : {}),
    ...(mode === "proxy" ? { proxyHeader } : {}),
    ...(trustedProxies.isEmpty ? {} : { trustedProxies: trustedProxies.entries }),
  });
}

// Writes the minute in progress so a restart doesn't drop it; the next process merges into it.
function flushMetricHistory() {
  if (!isDbInitialized()) {
    return;
  }

  try {
    metricHistory.flush(Date.now(), { includePartial: true });
  } catch (error) {
    writeLog("error", "metric_history.flush_failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
}

export function shutdown() {
  cancelAllJobs();
  // Before the database closes: running checks are cancelled and their results dropped.
  statusMonitor.stop();
  stopCollection();
  flushMetricHistory();
  closeDb();
  resetAuth();
  runtimeInitialized = false;
}

// Registering a signal handler suppresses the runtime's default terminate
// behavior, so the handler must exit explicitly or the process hangs until
// SIGKILL (e.g. after docker stop's grace period).
function handleTerminationSignal() {
  shutdown();
  process.exit(0);
}

function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  process.once("SIGINT", handleTerminationSignal);
  process.once("SIGTERM", handleTerminationSignal);
  signalHandlersRegistered = true;
}

export function initializeServer(options: InitializeServerOptions = {}) {
  if (runtimeInitialized) {
    return;
  }

  // Read first, so a bad auth setup stops startup before anything touches the data directory.
  const authConfig = options.auth ?? parseAuthConfig(process.env);

  initializeDb({
    dataDir: options.dataDir,
    dbPath: options.dbPath,
  });
  configureAuth(authConfig, getDb());

  if (options.cleanupIcons !== false) {
    runIconCleanup();
  }

  if (options.startMetrics !== false) {
    startCollection();
  }

  if (options.startJobs !== false) {
    startBackgroundJobs();
    // A seed file only matters on a fresh install; icons download in the background.
    void applySeedIfFresh();
  }

  if (options.registerSignalHandlers !== false) {
    registerSignalHandlers();
  }

  if (options.logStartup !== false) {
    console.log(`🚀 orbitdash server starting on port ${options.port ?? 3001}`);
    console.log(`📁 Data directory: ${getDataDir()}`);
    logAuthMode();
  }

  runtimeInitialized = true;
}
