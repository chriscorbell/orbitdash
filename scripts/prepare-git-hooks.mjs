import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { setHooksFromConfig, skipInstall } = require("simple-git-hooks/simple-git-hooks");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getOptionalGitConfig(key) {
  try {
    return runGit(["config", "--local", "--get", key]);
  } catch {
    return null;
  }
}

function setGitConfig(key, value) {
  runGit(["config", "--local", key, value]);
}

function unsetGitConfig(key) {
  try {
    runGit(["config", "--local", "--unset", key]);
  } catch {
    // Ignore missing config keys so prepare remains idempotent.
  }
}

if (skipInstall()) {
  process.exit(0);
}

try {
  runGit(["rev-parse", "--git-dir"]);
} catch {
  process.exit(0);
}

const projectRoot = process.cwd();
const dotGitPath = path.join(projectRoot, ".git");
const hooksPath = runGit(["rev-parse", "--git-path", "hooks"]);
const defaultHooksPath = path.join(projectRoot, ".git", "hooks");
const currentHooksPath = getOptionalGitConfig("core.hooksPath");

const needsTemporaryHooksPath =
  fs.existsSync(dotGitPath) &&
  fs.lstatSync(dotGitPath).isFile() &&
  !currentHooksPath &&
  path.resolve(projectRoot, hooksPath) !== path.resolve(projectRoot, defaultHooksPath);

try {
  if (needsTemporaryHooksPath) {
    setGitConfig("core.hooksPath", hooksPath);
  }

  await setHooksFromConfig(projectRoot, process.argv);
  console.log("[INFO] Successfully set all git hooks");
} catch (error) {
  console.log(`[ERROR], Was not able to set git hooks. Error: ${error}`);
  process.exitCode = 1;
} finally {
  if (needsTemporaryHooksPath) {
    unsetGitConfig("core.hooksPath");
  }
}
