import fs from "node:fs";

// Every run starts from an empty board.
fs.rmSync(process.env.ORBITDASH_DATA_DIR ?? ".e2e-data", { recursive: true, force: true });
await import("../server/index.ts");
