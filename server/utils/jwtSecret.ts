import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

/**
 * The secret that signs session tokens (sweep item 8).
 *
 * `JWT_SECRET` wins when it is set to a value of Peek's own. Otherwise Peek
 * generates a secret once and keeps it in `<CONFIG_DIR>/.jwt-secret`, so it
 * survives restarts and upgrades. Values published in Peek's docs and
 * templates are ignored: anyone could sign a token with them.
 *
 * Read it with getJwtSecret(), never at module load: `index.ts` loads `.env`
 * after the imports have run.
 */

export const JWT_SECRET_FILE = ".jwt-secret";

export const PUBLISHED_EXAMPLE_SECRETS: ReadonlySet<string> = new Set([
  "your-secret-key-change-in-production", // old built-in fallback in middleware/auth.ts
  "your-super-secure-jwt-secret-key-here-change-me", // .env.example
  "change-this-to-a-secure-random-string", // unraid-template.xml <Variable>
  "your_very_long_random_secret_key_here", // configuration.md examples
  "dev-secret-change-in-production", // configuration.md, local-setup.md
  "your-dev-secret-here", // local-setup.md
  "test-secret", // local-setup.md
  "your-secret-here", // docker-basics.md
  "abc123", // docker-basics.md
]);

export type JwtSecretSource = "env" | "file" | "generated";

const MIN_SECRET_LENGTH = 32;

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): {
  secret: string;
  source: JwtSecretSource;
} {
  const fromEnv = env.JWT_SECRET?.trim();
  if (fromEnv && !PUBLISHED_EXAMPLE_SECRETS.has(fromEnv)) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      logger.warn(
        `JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters. Use a longer random value (openssl rand -base64 32), or unset it and Peek will generate one.`
      );
    }
    logger.info("JWT signing secret source: JWT_SECRET");
    return { secret: fromEnv, source: "env" };
  }
  if (fromEnv) {
    logger.warn(
      "JWT_SECRET is set to a published example value and is ignored. Peek uses its own generated secret instead; remove JWT_SECRET or set it to a random value."
    );
  }

  const dir = env.CONFIG_DIR || "/app/data";
  const file = path.join(dir, JWT_SECRET_FILE);

  try {
    const stored = fs.readFileSync(file, "utf8").trim();
    if (stored.length >= MIN_SECRET_LENGTH) {
      logger.info(`JWT signing secret source: ${file}`);
      return { secret: stored, source: "file" };
    }
  } catch {
    // No usable file yet: generate one below
  }

  const secret = crypto.randomBytes(48).toString("base64url");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, secret + "\n", { mode: 0o600 });
    // mode applies only when the file is created; tighten a replaced short one
    fs.chmodSync(file, 0o600);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `JWT_SECRET is not set and Peek cannot write ${file}: ${reason}. Set JWT_SECRET or make ${dir} writable.`
    );
  }
  logger.info(`JWT signing secret source: generated into ${file}`);
  return { secret, source: "generated" };
}

let cachedSecret: string | null = null;

/** The signing secret, resolved on first use and then kept for the process. */
export function getJwtSecret(): string {
  cachedSecret ??= resolveJwtSecret().secret;
  return cachedSecret;
}

export function _resetJwtSecretForTesting(): void {
  cachedSecret = null;
}
