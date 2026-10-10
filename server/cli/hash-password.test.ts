import { describe, expect, it } from "bun:test";
import path from "path";

// Run as a process, the way people use it; importing it would pull its terminal-only code into
// the server coverage report.
const script = path.join(import.meta.dirname, "hash-password.ts");
const doubleDollars = (value: string) => value.replace(/\$/g, () => "$$");

async function run(stdin: string) {
  const child = Bun.spawn(["bun", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(stdin);
  await child.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stderr, stdout };
}

describe("hash-password", () => {
  it("prints only an argon2id hash of the piped password on stdout", async () => {
    const { exitCode, stderr, stdout } = await run("hunter22 with spaces \n");

    expect(exitCode).toBe(0);
    const hash = stdout.trim();
    expect(hash).toStartWith("$argon2id$");
    expect(stdout.split("\n").filter(Boolean)).toHaveLength(1);
    // One trailing newline is dropped; the rest of the password is kept as typed.
    expect(await Bun.password.verify("hunter22 with spaces ", hash)).toBe(true);
    // The compose hint doubles every $, since docker-compose.yml interpolates them.
    expect(stderr).toContain(`ORBITDASH_PASSWORD_HASH: "${doubleDollars(hash)}"`);
    expect(stderr).not.toContain("hunter22");
  });

  it("refuses an empty password", async () => {
    const { exitCode, stderr, stdout } = await run("\n");
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("the password is empty");
  });

  it("refuses a password longer than the server accepts", async () => {
    const { exitCode, stderr } = await run("x".repeat(1025));
    expect(exitCode).toBe(1);
    expect(stderr).toContain("longer than 1024 characters");
  });
});
