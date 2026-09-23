/**
 * Minimal real HTTP app for route tests.
 *
 * Builds an Express app with the JSON and cookie parsers the real server
 * installs, lets the test mount its routers, and listens on a random port on
 * 127.0.0.1. Tests call it with the global `fetch`.
 */
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

export async function startTestApp(
  mount: (app: Express) => void
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  mount(app);

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", (error?: Error) =>
      error ? reject(error) : resolve(listening)
    );
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
