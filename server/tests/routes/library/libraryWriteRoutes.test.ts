/**
 * The library routers must not expose write routes that reach Stash.
 *
 * Real Express and real HTTP, with the four library routers mounted the way
 * `initializers/api.ts` mounts them. A signed-in non-admin user sends a PUT
 * for each entity type; the request must 404 and never call Stash.
 */
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type http from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import libraryPerformersRoutes from "../../../routes/library/performers.js";
import libraryScenesRoutes from "../../../routes/library/scenes.js";
import libraryStudiosRoutes from "../../../routes/library/studios.js";
import libraryTagsRoutes from "../../../routes/library/tags.js";
import { stashInstanceManager } from "../../../services/StashInstanceManager.js";

vi.mock("../../../middleware/auth.js", () => ({
  authenticate: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      id: 2,
      username: "restricted",
      role: "USER",
    };
    next();
  }),
  requireCacheReady: vi.fn(
    (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));

vi.mock("../../../utils/entityInstanceId.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../utils/entityInstanceId.js")>();
  return {
    ...actual,
    getEntityInstanceId: vi.fn().mockResolvedValue("inst-1"),
  };
});

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const fakeStash = {
  sceneUpdate: vi.fn().mockResolvedValue({ sceneUpdate: { id: "1" } }),
  performerUpdate: vi.fn().mockResolvedValue({ performerUpdate: { id: "1" } }),
  studioUpdate: vi.fn().mockResolvedValue({ studioUpdate: { id: "1" } }),
  tagUpdate: vi.fn().mockResolvedValue({ tagUpdate: { id: "1" } }),
};

type FakeStashMethod = keyof typeof fakeStash;

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

describe("library write routes", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/library", libraryScenesRoutes);
    app.use("/api/library", libraryPerformersRoutes);
    app.use("/api/library", libraryStudiosRoutes);
    app.use("/api/library", libraryTagsRoutes);
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(stashInstanceManager, "get").mockReturnValue(fakeStash as never);
  });

  it.each([
    ["scenes", "sceneUpdate"],
    ["performers", "performerUpdate"],
    ["studios", "studioUpdate"],
    ["tags", "tagUpdate"],
  ] as const)(
    "PUT /api/library/%s/:id is gone and never reaches Stash",
    async (type: string, method: FakeStashMethod) => {
      const res = await fetch(`${baseUrl}/api/library/${type}/1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });

      expect(fakeStash[method]).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    }
  );

  it("the library controllers no longer export update handlers", async () => {
    const modules = await Promise.all([
      import("../../../controllers/library/scenes.js"),
      import("../../../controllers/library/performers.js"),
      import("../../../controllers/library/studios.js"),
      import("../../../controllers/library/tags.js"),
    ]);
    const exported = modules.flatMap((mod) => Object.keys(mod));

    for (const name of [
      "updateScene",
      "updatePerformer",
      "updateStudio",
      "updateTag",
    ]) {
      expect(exported).not.toContain(name);
    }
  });
});
