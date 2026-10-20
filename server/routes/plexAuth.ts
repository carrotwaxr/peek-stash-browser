import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import {
  type AuthenticatedRequest,
  authenticate,
  generateToken,
  requireAdmin,
  setTokenCookie,
} from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import {
  cancelPlexFlow,
  plexAccessAllowed,
  plexConfig,
  pollPlexFlow,
  startPlexFlow,
} from "../services/PlexAuthService.js";
import {
  disconnectPlex,
  listPlexServers,
  plexConnectionStatus,
  selectPlexServer,
  setPlexActive,
  syncPlexUsers,
} from "../services/PlexServerService.js";
import { setPlexEnabled } from "../services/PlexSettings.js";
import rankingComputeService from "../services/RankingComputeService.js";
import { dbWriteTransaction } from "../utils/dbWrite.js";
import { secureRequestCookie } from "../utils/secureRequestCookie.js";

const router = express.Router();
const cookieName = "peekPlexFlow";
const cookieOptions = (req: express.Request) => ({
  httpOnly: true,
  secure: secureRequestCookie(req),
  sameSite: "strict" as const,
  path: "/api/auth/plex",
  maxAge: 10 * 60 * 1000,
});
const startLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
});

// Compare the browser origin with the original Host, including its port.
// Forwarded host/protocol headers are deliberately ignored.
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    const origin = req.get("Origin");
    let valid = false;
    try {
      valid =
        !!origin &&
        ["http:", "https:"].includes(new URL(origin).protocol) &&
        new URL(origin).host === req.get("host");
    } catch {
      /* invalid origin */
    }
    if (
      !valid ||
      req.get("Sec-Fetch-Site") === "cross-site" ||
      !req.is("application/json")
    ) {
      res.status(403).json({ error: "Same-origin JSON request required" });
      return;
    }
  }
  next();
});

router.get("/config", (_req, res) => res.json({ enabled: !!plexConfig() }));

router.get("/account", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: (req as AuthenticatedRequest).user.id },
    select: {
      plexOnly: true,
      plexIdentity: { select: { accountId: true, approved: true } },
    },
  });
  res.json({
    enabled: !!plexConfig(),
    plexOnly: user?.plexOnly ?? false,
    identity: user?.plexIdentity ?? null,
  });
});

router.post("/start", startLimiter, async (req, res) => {
  const binding = randomBytes(32).toString("base64url");
  const flow = await startPlexFlow(binding);
  res.cookie(cookieName, binding, cookieOptions(req)).json(flow);
});

router.post("/link/start", startLimiter, authenticate, async (req, res) => {
  const { user: session } = req as AuthenticatedRequest;
  const { password } = (req.body ?? {}) as { password?: unknown };
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (
    !user ||
    user.disabled ||
    user.plexOnly ||
    typeof password !== "string" ||
    password.length > 1024 ||
    !(await bcrypt.compare(password, user.password))
  ) {
    throw new AppError("Current local password is required to link Plex", 400);
  }
  const binding = randomBytes(32).toString("base64url");
  const flow = await startPlexFlow(binding, user.id);
  res.cookie(cookieName, binding, cookieOptions(req)).json(flow);
});

function readFlow(req: express.Request) {
  const { correlationId } = (req.body ?? {}) as { correlationId?: unknown };
  const binding: unknown = req.cookies[cookieName];
  if (
    typeof correlationId !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(correlationId) ||
    typeof binding !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(binding)
  ) {
    throw new AppError("Invalid sign-in correlation", 400);
  }
  return { correlationId, binding };
}

async function poll(
  req: express.Request,
  res: express.Response,
  userId?: number
) {
  const { correlationId, binding } = readFlow(req);
  const result = await pollPlexFlow(correlationId, binding, userId);
  if (result.status === "pending") {
    res.json(result);
    return;
  }
  if (result.status === "connected") {
    res
      .clearCookie(cookieName, cookieOptions(req))
      .json({ status: "connected" });
    return;
  }
  res.clearCookie(cookieName, cookieOptions(req));
  if (!result.linked && !(await plexAccessAllowed(result.user.id, true)))
    throw new AppError("Plex approval has been revoked", 403);
  if (!result.linked) {
    setTokenCookie(res, generateToken(result.user, undefined, "plex"));
    void rankingComputeService.ensureFresh(result.user.id);
  }
  res.json({
    success: true,
    status: "complete",
    linked: result.linked,
    user: {
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
      setupCompleted: result.user.setupCompleted,
    },
    landingPagePreference: result.user.landingPagePreference ?? {
      pages: ["home"],
      randomize: false,
    },
  });
}
router.post("/poll", pollLimiter, async (req, res) => poll(req, res));
router.post("/link/poll", pollLimiter, authenticate, async (req, res) =>
  poll(req, res, (req as AuthenticatedRequest).user.id)
);
router.post("/cancel", pollLimiter, (req, res) => {
  const { correlationId, binding } = readFlow(req);
  cancelPlexFlow(correlationId, binding);
  res.clearCookie(cookieName, cookieOptions(req)).json({ success: true });
});

router.use("/admin", authenticate, requireAdmin);
router.put("/admin/settings", (req, res) => {
  const { enabled } = (req.body ?? {}) as { enabled?: unknown };
  if (typeof enabled !== "boolean")
    throw new AppError("An enabled flag is required", 400);
  setPlexEnabled(enabled);
  res.json({ enabled: !!plexConfig() });
});
router.get("/admin/connection", async (_req, res) => {
  res.json(await plexConnectionStatus());
});
router.get("/admin/servers", async (_req, res) => {
  res.json({ servers: await listPlexServers() });
});
router.post("/admin/connect/start", startLimiter, async (req, res) => {
  const binding = randomBytes(32).toString("base64url");
  const flow = await startPlexFlow(
    binding,
    undefined,
    (req as AuthenticatedRequest).user.id
  );
  res.cookie(cookieName, binding, cookieOptions(req)).json(flow);
});
router.post("/admin/connect/poll", pollLimiter, async (req, res) =>
  poll(req, res, (req as AuthenticatedRequest).user.id)
);
router.post("/admin/server", async (req, res) => {
  const { serverId } = (req.body ?? {}) as { serverId?: unknown };
  if (typeof serverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(serverId))
    throw new AppError("Select a valid Plex server", 400);
  res.json(await selectPlexServer(serverId));
});
router.post("/admin/sync", async (_req, res) => {
  res.json(await syncPlexUsers());
});
router.post("/admin/disconnect", async (_req, res) => {
  await disconnectPlex();
  res.json({ success: true });
});
router.put("/admin/active", async (req, res) => {
  const { accountId, active } = (req.body ?? {}) as {
    accountId?: unknown;
    active?: unknown;
  };
  if (
    typeof accountId !== "string" ||
    !/^[1-9]\d{0,15}$/.test(accountId) ||
    typeof active !== "boolean"
  )
    throw new AppError("Invalid Plex account or activation setting", 400);
  await setPlexActive(accountId, active, (req as AuthenticatedRequest).user.id);
  res.json({ success: true });
});
router.get("/admin", async (_req, res) => {
  const identities = await prisma.plexIdentity.findMany({
    include: {
      user: {
        select: { id: true, username: true, disabled: true, role: true },
      },
    },
    orderBy: { accountId: "asc" },
  });
  const users = await prisma.user.findMany({
    select: { id: true, username: true, disabled: true, role: true },
    orderBy: { username: "asc" },
  });
  res.json({ enabled: !!plexConfig(), identities, users });
});
router.put("/admin/approval", async (req, res) => {
  const { accountId, approved } = (req.body ?? {}) as {
    accountId?: unknown;
    approved?: unknown;
  };
  if (
    typeof accountId !== "string" ||
    !/^[1-9]\d{0,15}$/.test(accountId) ||
    typeof approved !== "boolean"
  )
    throw new AppError(
      "A numeric Plex account ID and approval flag are required",
      400
    );
  // Queue with account creation so a revocation cannot race provisioning.
  await dbWriteTransaction("plex-approval", async (tx) => {
    if (await tx.plexConnection.findUnique({ where: { id: 1 } }))
      throw new AppError("Manage imported users with the Active control", 400);
    await tx.plexIdentity.upsert({
      where: { accountId },
      create: { accountId, approved },
      update: { approved },
    });
  });
  res.json({ success: true });
});
router.put("/admin/disabled", async (req, res) => {
  const { userId, disabled } = (req.body ?? {}) as {
    userId?: unknown;
    disabled?: unknown;
  };
  if (
    typeof userId !== "number" ||
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    typeof disabled !== "boolean"
  )
    throw new AppError("Invalid user or disabled flag", 400);
  if (userId === (req as AuthenticatedRequest).user.id)
    throw new AppError("You cannot disable your own account", 400);
  await dbWriteTransaction("user-disable", async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404);
    if (disabled && user.role === "ADMIN") {
      const remaining = await tx.user.count({
        where: {
          role: "ADMIN",
          disabled: false,
          plexOnly: false,
          id: { not: userId },
        },
      });
      if (!remaining)
        throw new AppError(
          "Keep a local administrator available for recovery",
          400
        );
    }
    await tx.user.update({ where: { id: userId }, data: { disabled } });
  });
  res.json({ success: true });
});

export default router;
