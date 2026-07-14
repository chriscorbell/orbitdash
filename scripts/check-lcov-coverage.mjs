import { readFile } from "node:fs/promises";

const [reportPath, linesThresholdArg, functionsThresholdArg] = process.argv.slice(2);
const linesThreshold = Number(linesThresholdArg);
const functionsThreshold = Number(functionsThresholdArg);

if (
  !reportPath ||
  !Number.isFinite(linesThreshold) ||
  !Number.isFinite(functionsThreshold) ||
  linesThreshold < 0 ||
  linesThreshold > 100 ||
  functionsThreshold < 0 ||
  functionsThreshold > 100
) {
  throw new Error(
    "Usage: node scripts/check-lcov-coverage.mjs <lcov-file> <lines-percent> <functions-percent>"
  );
}

const totals = { functionsFound: 0, functionsHit: 0, linesFound: 0, linesHit: 0 };
const fieldMap = {
  FNF: "functionsFound",
  FNH: "functionsHit",
  LF: "linesFound",
  LH: "linesHit",
};

for (const line of (await readFile(reportPath, "utf8")).split("\n")) {
  const [field, value] = line.split(":");
  const totalKey = fieldMap[field];
  if (totalKey) totals[totalKey] += Number(value);
}

if (totals.linesFound === 0 || totals.functionsFound === 0) {
  throw new Error(`No line/function totals found in ${reportPath}`);
}

const linesPercent = (totals.linesHit / totals.linesFound) * 100;
const functionsPercent = (totals.functionsHit / totals.functionsFound) * 100;

console.log(
  `Server coverage: ${totals.linesHit}/${totals.linesFound} lines (${linesPercent.toFixed(2)}%), ` +
    `${totals.functionsHit}/${totals.functionsFound} functions (${functionsPercent.toFixed(2)}%)`
);

if (linesPercent < linesThreshold || functionsPercent < functionsThreshold) {
  console.error(
    `Server coverage must remain at least ${linesThreshold}% lines and ${functionsThreshold}% functions`
  );
  process.exitCode = 1;
}
