import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_CONFIG = {
  serverPort: 9999,
  get baseUrl() {
    return `http://localhost:${this.serverPort}`;
  },
  /** A replay run (STASH_REPLAY=1) starts from its own, fresh database. */
  get databasePath() {
    return path.resolve(
      __dirname,
      process.env.STASH_REPLAY === "1" ? "../test-replay.db" : "../test.db"
    );
  },
  get databaseUrl() {
    return `file:${this.databasePath}`;
  },
};
