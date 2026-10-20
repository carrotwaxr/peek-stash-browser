import { createHash, randomBytes } from "crypto";
import { AppError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import { dbWriteTransaction } from "../utils/dbWrite.js";
import { plexConfig, plexRequest } from "./PlexHttp.js";
import { connectPlexOwner } from "./PlexServerService.js";

export { plexConfig } from "./PlexHttp.js";

const FLOW_TTL = 10 * 60 * 1000;
const MAX_PENDING = 500;
const POLL_INTERVAL = 2000;
interface Pending {
  pinId: number;
  code: string;
  binding: string;
  expires: number;
  nextPoll: number;
  busy: boolean;
  linkUserId: number | undefined;
  connectAdminId: number | undefined;
}
const pending = new Map<string, Pending>();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function startPlexFlow(
  binding: string,
  linkUserId?: number,
  connectAdminId?: number
) {
  const settings = plexConfig();
  if (!settings) throw new AppError("Plex sign-in is disabled", 404);
  for (const [key, flow] of pending) {
    if (flow.expires <= Date.now()) pending.delete(key);
  }
  if (pending.size >= MAX_PENDING)
    throw new AppError("Too many pending sign-ins. Try again later.", 503);
  const pin = await plexRequest("pins", {
    method: "POST",
    body: new URLSearchParams({ strong: "true" }),
  });
  if (
    !Number.isSafeInteger(pin.id) ||
    typeof pin.code !== "string" ||
    !pin.code
  ) {
    throw new AppError("Plex returned an invalid PIN", 502);
  }
  const id = randomBytes(32).toString("base64url");
  // Other starts may have finished while Plex was answering.
  if (pending.size >= MAX_PENDING)
    throw new AppError("Too many pending sign-ins. Try again later.", 503);
  const upstreamExpiry =
    typeof pin.expiresAt === "string"
      ? Date.parse(pin.expiresAt)
      : Date.now() + FLOW_TTL;
  const expires = Math.min(
    Date.now() + FLOW_TTL,
    Number.isFinite(upstreamExpiry) ? upstreamExpiry : Date.now() + FLOW_TTL
  );
  pending.set(id, {
    pinId: pin.id as number,
    code: pin.code,
    binding: hash(binding),
    expires,
    nextPoll: 0,
    busy: false,
    linkUserId,
    connectAdminId,
  });
  const params = new URLSearchParams({
    clientID: settings.clientId,
    code: pin.code,
    "context[device][product]": settings.product,
  });
  return {
    correlationId: id,
    authorizationUrl: `https://app.plex.tv/auth#?${params}`,
    expiresAt: new Date(expires).toISOString(),
  };
}

function flowFor(id: string, binding: string) {
  const flow = pending.get(id);
  if (!flow || flow.binding !== hash(binding))
    throw new AppError("Invalid or completed sign-in", 400);
  if (flow.expires <= Date.now()) {
    pending.delete(id);
    throw new AppError("Plex sign-in expired. Please start again.", 410);
  }
  return flow;
}

export function cancelPlexFlow(id: string, binding: string) {
  flowFor(id, binding);
  pending.delete(id);
}

export async function pollPlexFlow(
  id: string,
  binding: string,
  authenticatedUserId?: number
) {
  if (!plexConfig()) throw new AppError("Plex sign-in is disabled", 404);
  const flow = flowFor(id, binding);
  if (
    flow.connectAdminId !== undefined &&
    flow.connectAdminId !== authenticatedUserId
  )
    throw new AppError("Original administrator session required", 403);
  if (
    flow.linkUserId !== undefined &&
    flow.linkUserId !== authenticatedUserId
  ) {
    throw new AppError(
      "Sign in to the original local account to link Plex",
      403
    );
  }
  if (flow.busy || flow.nextPoll > Date.now())
    return { status: "pending" as const };
  flow.busy = true;
  flow.nextPoll = Date.now() + POLL_INTERVAL;
  try {
    const pin = await plexRequest(
      `pins/${flow.pinId}?${new URLSearchParams({ code: flow.code })}`
    );
    if (pin.authToken == null) return { status: "pending" as const };
    if (typeof pin.authToken !== "string" || !pin.authToken)
      throw new AppError("Plex token validation failed", 502);
    const account = await plexRequest("user", { token: pin.authToken });
    if (!Number.isSafeInteger(account.id) || (account.id as number) <= 0)
      throw new AppError("Plex account validation failed", 502);
    const accountId = String(account.id);
    if (flow.connectAdminId !== undefined) {
      await connectPlexOwner(
        pin.authToken,
        accountId,
        typeof account.username === "string" ? account.username : accountId,
        flow.connectAdminId,
        () => {
          flowFor(id, binding);
        }
      );
      pending.delete(id);
      return { status: "connected" as const };
    }
    const user = await dbWriteTransaction("plex-login", async (tx) => {
      // Check again inside the writer queue, so cancellation while waiting wins.
      flowFor(id, binding);
      const identity = await tx.plexIdentity.findUnique({
        where: { accountId },
        include: { user: true },
      });
      const connection = await tx.plexConnection.findUnique({
        where: { id: 1 },
      });
      if (
        connection &&
        (!connection.encryptedToken ||
          !connection.serverId ||
          !identity?.serverMember)
      )
        throw new AppError(
          "This Plex account does not have access to the connected server",
          403
        );
      if (!identity || (!identity.approved && flow.linkUserId === undefined)) {
        if (connection)
          throw new AppError(
            "This Plex profile is inactive in Peek. Ask your administrator to activate it in User Management.",
            403
          );
        throw new AppError(
          `Plex account ${accountId} is not approved. Ask your Peek administrator to approve this ID.`,
          403
        );
      }
      if (flow.linkUserId !== undefined) {
        const local = await tx.user.findUnique({
          where: { id: flow.linkUserId },
          include: { plexIdentity: true },
        });
        if (!local || local.disabled || local.plexOnly || local.plexIdentity) {
          throw new AppError(
            "This account cannot be linked. Contact your administrator.",
            409
          );
        }
        if (identity.userId !== null && identity.userId !== local.id) {
          const placeholder = identity.user;
          const used =
            placeholder &&
            (placeholder.setupCompleted ||
              !placeholder.disabled ||
              !placeholder.plexOnly ||
              placeholder.role !== "USER" ||
              (await tx.watchHistory.count({
                where: { userId: placeholder.id },
              })) > 0 ||
              (await tx.playlist.count({ where: { userId: placeholder.id } })) >
                0 ||
              (await tx.sceneRating.count({
                where: { userId: placeholder.id },
              })) > 0 ||
              (await tx.imageViewHistory.count({
                where: { userId: placeholder.id },
              })) > 0);
          if (!placeholder || used)
            throw new AppError(
              "This account cannot be linked. Its existing profile contains activity or has already been activated.",
              409
            );
          // Keep the unused placeholder as an inactive local record; never delete or merge user data.
          await tx.plexIdentity.update({
            where: { accountId },
            data: { userId: null },
          });
        }
        await tx.plexIdentity.update({
          where: { accountId },
          data: { userId: local.id },
        });
        return local;
      }
      if (identity.user) {
        if (identity.user.disabled)
          throw new AppError("Account is disabled", 403);
        return identity.user;
      }
      // Random suffix avoids collisions with local names. No username/email matching.
      const created = await tx.user.create({
        data: {
          username: `plex-${accountId}-${randomBytes(6).toString("hex")}`,
          password: "!plex-only",
          plexOnly: true,
          role: "USER",
        },
      });
      await tx.plexIdentity.update({
        where: { accountId },
        data: { userId: created.id },
      });
      return created;
    });
    flowFor(id, binding);
    pending.delete(id);
    return {
      status: "complete" as const,
      user,
      accountId,
      linked: flow.linkUserId !== undefined,
    };
  } catch (error) {
    pending.delete(id);
    throw error;
  } finally {
    flow.busy = false;
  }
}

/** Used by every authentication path, including signed media. */
export async function plexAccessAllowed(
  userId: number,
  plexSession = false,
  linkedMedia = false
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabled: true, plexOnly: true, plexIdentity: true },
  });
  if (!user || user.disabled) return false;
  const needsPlex =
    user.plexOnly || plexSession || (linkedMedia && !!user.plexIdentity);
  if (!needsPlex) return true;
  const connection = await prisma.plexConnection.findUnique({
    where: { id: 1 },
  });
  if (
    connection &&
    (!connection.encryptedToken ||
      !connection.serverId ||
      !user.plexIdentity?.serverMember)
  )
    return false;
  return (
    !(user.plexOnly || plexSession || (linkedMedia && user.plexIdentity)) ||
    (!!plexConfig() && user.plexIdentity?.approved === true)
  );
}
