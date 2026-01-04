import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_CONFIG = {
  serverPort: 9999,
  get baseUrl() {
    return `http://localhost:${this.serverPort}`;
  },
  get databasePath() {
    return path.resolve(__dirname, "../test.db");
  },
  get databaseUrl() {
    return `file:${this.databasePath}`;
  },
};
