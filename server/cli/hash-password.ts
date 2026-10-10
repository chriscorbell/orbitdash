/**
 * Prints an argon2id hash for ORBITDASH_PASSWORD_HASH.
 *
 *   bun run hash-password
 *   docker exec -it orbitdash bun server/cli/hash-password.ts
 *
 * In a terminal it asks twice without echoing; otherwise it reads the password from stdin (one
 * trailing newline is dropped). The password is never taken as an argument, so it stays out of
 * shell history. Only the hash goes to stdout; prompts and hints go to stderr.
 */
import { MAX_PASSWORD_LENGTH } from "@shared/auth";

/** docker-compose.yml interpolates `$`, so a hash pasted there needs every `$` doubled. */
function escapeForCompose(value: string): string {
  return value.replaceAll("$", "$$$$");
}

function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") return finish();
        if (char === "\u0003") return finish(new Error("cancelled"));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPiped(): Promise<string> {
  const text = await Bun.stdin.text();
  return text.replace(/\r?\n$/, "");
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readPiped();

  const password = await readHidden("Password: ");
  const again = await readHidden("Repeat password: ");
  if (password !== again) throw new Error("the passwords don't match");
  return password;
}

async function main() {
  const password = await readPassword();
  if (password === "") throw new Error("the password is empty");
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`the password is longer than ${MAX_PASSWORD_LENGTH} characters`);
  }

  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  process.stdout.write(`${hash}\n`);
  process.stderr.write(
    `\nSet ORBITDASH_AUTH=password and ORBITDASH_PASSWORD_HASH to the hash above.\nIn docker-compose.yml, write it with every $ doubled:\n  ORBITDASH_PASSWORD_HASH: "${escapeForCompose(hash)}"\n`
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`hash-password: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
