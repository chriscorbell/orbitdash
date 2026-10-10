import { closeDb, getDataDir, initializeDb } from "./db";
import { cancelAllJobs, scheduleJob } from "./jobs";
import { startCollection, stopCollection } from "./metrics";
import { runNightlySnapshotIfDue } from "./services/backup-schedule";

export interface InitializeServerOptions {
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

function startBackgroundJobs() {
  // Checked hourly so a server that restarts often still gets one snapshot a day.
  scheduleJob("nightly-snapshot", () => void runNightlySnapshotIfDue(), {
    initialDelayMs: 60_000,
    intervalMs: HOUR_MS,
  });
}

export function shutdown() {
  cancelAllJobs();
  stopCollection();
  closeDb();
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

  initializeDb({
    dataDir: options.dataDir,
    dbPath: options.dbPath,
  });

  if (options.startMetrics !== false) {
    startCollection();
  }

  if (options.startJobs !== false) {
    startBackgroundJobs();
  }

  if (options.registerSignalHandlers !== false) {
    registerSignalHandlers();
  }

  if (options.logStartup !== false) {
    console.log(`🚀 orbitdash server starting on port ${options.port ?? 3001}`);
    console.log(`📁 Data directory: ${getDataDir()}`);
  }

  runtimeInitialized = true;
}
