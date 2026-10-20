import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { AppError } from "../middleware/errorHandler.js";
import { getConfigDir } from "./configDir.js";

function key(create: boolean): Buffer {
  const dir = getConfigDir();
  const file = path.join(dir, ".plex-key");
  try {
    if (!existsSync(file) && create) {
      mkdirSync(dir, { recursive: true });
      try {
        writeFileSync(file, randomBytes(32), { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const value = readFileSync(file);
    if (value.length !== 32) throw new Error("Invalid key");
    return value;
  } catch {
    throw new AppError(
      "Plex encryption key is unavailable. Restore .plex-key from backup or reconnect Plex.",
      503
    );
  }
}

export function encryptPlexToken(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(true), nonce);
  cipher.setAAD(Buffer.from("peek:plex-owner:v1"));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPlexToken(value: string): string {
  const encryptionKey = key(false);
  try {
    const [version, nonce, tag, ciphertext, extra] = value.split(".");
    if (
      version !== "v1" ||
      !nonce ||
      !tag ||
      !ciphertext ||
      extra !== undefined
    )
      throw new Error("Invalid envelope");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(nonce, "base64url")
    );
    decipher.setAAD(Buffer.from("peek:plex-owner:v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "Plex credentials could not be decrypted. Restore the matching key or reconnect Plex.",
      503
    );
  }
}
