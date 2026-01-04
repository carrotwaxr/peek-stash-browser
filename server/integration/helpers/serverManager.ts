import type { Server } from "http";

// Store server instance globally for teardown
let serverInstance: Server | null = null;

export function setServerInstance(server: Server): void {
  serverInstance = server;
}

export function getServerInstance(): Server | null {
  return serverInstance;
}

export async function stopServer(): Promise<void> {
  if (serverInstance) {
    return new Promise((resolve, reject) => {
      serverInstance!.close((err) => {
        if (err) {
          reject(err);
        } else {
          serverInstance = null;
          resolve();
        }
      });
    });
  }
}
