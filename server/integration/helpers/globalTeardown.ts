import { stopServer } from "./serverManager.js";

export async function teardown() {
  console.log("[Integration Tests] Starting global teardown...");

  await stopServer();

  console.log("[Integration Tests] Global teardown complete");
}

export default teardown;
