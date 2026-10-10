import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "../db";

const KEY_FILE = "secret.key";
const PREFIX = "v1:";

let cachedKey: { dir: string; key: Buffer } | null = null;

/**
 * The key integration secrets are encrypted with: 32 random bytes in `<data>/secret.key`,
 * created on first use and readable only by the server's user. A database or backup without it
 * doesn't reveal API keys.
 */
export function getSecretKey(dataDir: string = getDataDir()): Buffer {
  if (cachedKey?.dir === dataDir) return cachedKey.key;
  const file = path.join(dataDir, KEY_FILE);
  let key: Buffer;
  try {
    key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  } catch {
    key = Buffer.alloc(0);
  }
  if (key.length !== 32) {
    key = randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  }
  cachedKey = { dir: dataDir, key };
  return key;
}

export function resetSecretKeyForTesting() {
  cachedKey = null;
}

/** AES-256-GCM: "v1:" + base64(iv, auth tag, ciphertext). */
export function encryptSecret(plaintext: string, key: Buffer = getSecretKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** The secret, or null when it can't be read (another key, or tampered with). */
export function decryptSecret(sealed: string, key: Buffer = getSecretKey()): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
