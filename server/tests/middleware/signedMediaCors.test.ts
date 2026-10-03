/**
 * CORS for signed media (Contract 4): a Cast receiver or another origin
 * reads a signed stream, caption or poster with `*`, never with credentials,
 * and only a signed request on those three paths gets it. Runs the
 * middleware in a small Express app over real HTTP, so the headers are what
 * a browser would see.
 */
import { once } from "events";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSignedMediaRequest,
  signedMediaCors,
} from "../../middleware/signedMediaCors.js";
import { logger } from "../../utils/logger.js";
import { reqFor } from "../helpers/controllerTestUtils.js";
import { must } from "../helpers/must.js";

const SIGNED_PATHS = [
  "/api/scene/5/proxy-stream/stream",
  "/api/scene/5/proxy-stream/stream.m3u8/0.ts",
  "/api/scene/5/caption",
  "/api/scene/5/poster",
];

let server: Server | undefined;
let base = "";

beforeEach(async () => {
  const app = express();
  app.use(signedMediaCors);
  app.use((_req, res) => {
    res.status(200).send("ok");
  });
  server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => must(server).close(() => resolve()));
  server = undefined;
});

describe("signedMediaCors", () => {
  it.each(SIGNED_PATHS)(
    "a signed GET on %s gets Access-Control-Allow-Origin: * and the exposed range headers",
    async (path) => {
      const res = await fetch(`${base}${path}?instanceId=a&sig=abc`, {
        headers: { Origin: "https://receiver.example" },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-expose-headers")).toBe(
        "Content-Length, Content-Range, Accept-Ranges"
      );
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    }
  );

  it("an OPTIONS with sig gets 204, GET, HEAD and Range, without Private-Network unless asked", async () => {
    const res = await fetch(
      `${base}/api/scene/5/proxy-stream/stream?instanceId=a&sig=abc`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://receiver.example",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "range",
        },
      }
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, HEAD");
    expect(res.headers.get("access-control-allow-headers")).toBe("Range");
    expect(res.headers.get("access-control-allow-private-network")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("an OPTIONS with sig gets Access-Control-Allow-Private-Network: true when the preflight asks for it", async () => {
    const res = await fetch(`${base}/api/scene/5/poster?instanceId=a&sig=abc`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://receiver.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-private-network")).toBe(
      "true"
    );
  });

  it("a preflight logs one debug line naming the origin and the private-network flag, and not the URL", async () => {
    const debug = vi.spyOn(logger, "debug");

    await fetch(
      `${base}/api/scene/5/caption?instanceId=a&uid=1&sig=secretsig123`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://receiver.example",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Private-Network": "true",
        },
      }
    );

    expect(debug).toHaveBeenCalledOnce();
    const call = must(debug.mock.calls[0]);
    const logged = JSON.stringify(call);
    expect(call[0]).toBe(
      "preflight from https://receiver.example, private network: true"
    );
    expect(logged).not.toContain("secretsig123");
    expect(logged).not.toContain("/api/scene");
  });

  it("a request without sig gets no *, with or without a cookie", async () => {
    const bare = await fetch(`${base}/api/scene/5/proxy-stream/stream`, {
      headers: { Origin: "https://receiver.example" },
    });
    const withCookie = await fetch(`${base}/api/scene/5/caption?instanceId=a`, {
      headers: {
        Origin: "https://receiver.example",
        Cookie: "token=abc",
      },
    });
    const preflight = await fetch(`${base}/api/scene/5/poster?instanceId=a`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://receiver.example",
        "Access-Control-Request-Method": "GET",
      },
    });

    for (const res of [bare, withCookie, preflight]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.headers.get("access-control-expose-headers")).toBeNull();
    }
  });

  it("/api/library/scenes?sig=x gets nothing", async () => {
    const get = await fetch(`${base}/api/library/scenes?sig=x`, {
      headers: { Origin: "https://receiver.example" },
    });
    const preflight = await fetch(`${base}/api/library/scenes?sig=x`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://receiver.example",
        "Access-Control-Request-Method": "GET",
      },
    });

    for (const res of [get, preflight]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});

describe("isSignedMediaRequest", () => {
  const signed = (url: string, query: Record<string, unknown>) => {
    const req = reqFor(signedMediaCors, { url });
    Object.assign(req, { path: url, query });
    return isSignedMediaRequest(req);
  };

  it("matches the three media paths with a string sig", () => {
    for (const path of SIGNED_PATHS) {
      expect(signed(path, { sig: "abc" })).toBe(true);
    }
  });

  it("refuses a repeated sig, a missing sig, other paths and a non-numeric scene", () => {
    expect(signed("/api/scene/5/poster", { sig: ["a", "b"] })).toBe(false);
    expect(signed("/api/scene/5/poster", {})).toBe(false);
    expect(signed("/api/scene/5/poster/x", { sig: "a" })).toBe(false);
    expect(signed("/api/scene/5/captions", { sig: "a" })).toBe(false);
    expect(signed("/api/scene/5/external-player-link", { sig: "a" })).toBe(
      false
    );
    expect(signed("/api/scene/abc/poster", { sig: "a" })).toBe(false);
    expect(signed("/api/proxy/scene/5/preview", { sig: "a" })).toBe(false);
  });
});
