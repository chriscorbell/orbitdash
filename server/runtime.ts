import { closeDb, getDataDir, initializeDb } from "./db";
import { startCollection, stopCollection } from "./metrics";

export interface InitializeServerOptions {
  dataDir?: string;
  dbPath?: string;
  logStartup?: boolean;
  registerSignalHandlers?: boolean;
  startMetrics?: boolean;
  port?: number;
}

let runtimeInitialized = false;
let signalHandlersRegistered = false;

export function shutdown() {
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

  if (options.registerSignalHandlers !== false) {
    registerSignalHandlers();
  }

  if (options.logStartup !== false) {
    console.log(`🚀 orbitdash server starting on port ${options.port ?? 3001}`);
    console.log(`📁 Data directory: ${getDataDir()}`);
  }

  runtimeInitialized = true;
}
