import type { PlexConnection } from "@prisma/client";
import { randomBytes, randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { AppError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import { dbWriteTransaction } from "../utils/dbWrite.js";
import { decryptPlexToken, encryptPlexToken } from "../utils/plexEncryption.js";
import { plexConfig } from "./PlexHttp.js";

export const PLEX_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RESPONSE = 2 * 1024 * 1024;
let syncAbort: AbortController | undefined;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("Plex returned an invalid account list", 502);
  return value as Record<string, unknown>;
};
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const accountIdOf = (value: unknown): string => {
  const id = String(
    typeof value === "number" || typeof value === "string" ? value : ""
  );
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new AppError("Plex returned an invalid account ID", 502);
  return id;
};

async function request(
  path: string,
  token: string,
  xml = false
): Promise<string> {
  const config = plexConfig();
  if (!config) throw new AppError("Plex sign-in is disabled", 404);
  try {
    const response = await fetch(`https://plex.tv${path}`, {
      headers: {
        Accept: xml ? "application/xml" : "application/json",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": config.clientId,
        "X-Plex-Product": config.product,
      },
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(10000),
        ...(syncAbort ? [syncAbort.signal] : []),
      ]),
    });
    if (!response.ok || !response.body) throw new Error("Plex refused request");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE) throw new Error("Response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    throw new AppError(
      "Could not read Plex account data. Check the connection or reconnect Plex.",
      502
    );
  }
}

export interface PlexServer {
  id: string;
  name: string;
}
export interface PlexMember {
  accountId: string;
  username: string;
}

async function ownedServers(token: string): Promise<PlexServer[]> {
  let data: unknown;
  try {
    data = JSON.parse(await request("/api/v2/resources?includeHttps=1", token));
  } catch {
    throw new AppError(
      "Plex server discovery failed. Try reconnecting Plex.",
      502
    );
  }
  if (!Array.isArray(data))
    throw new AppError(
      "Plex server discovery returned an invalid response",
      502
    );
  const servers: PlexServer[] = [];
  for (const item of data) {
    const entry = record(item);
    if (!(entry.owned === true || entry.owned === 1 || entry.owned === "1"))
      continue;
    if (!text(entry.provides).split(",").includes("server")) continue;
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(text(entry.clientIdentifier)) ||
      !text(entry.name)
    )
      throw new AppError("Plex returned an invalid server", 502);
    servers.push({
      id: text(entry.clientIdentifier),
      name: text(entry.name).slice(0, 255),
    });
  }
  return servers;
}

/** Reject malformed/incomplete snapshots before any database writes. */
export function parsePlexMembers(xml: string, serverId: string): PlexMember[] {
  if (Buffer.byteLength(xml) > MAX_RESPONSE || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new AppError("Plex returned an invalid user list", 502);
  try {
    SyntaxValidator.validate(xml, { multipleRoots: false });
  } catch {
    throw new AppError("Plex returned an invalid user list", 502);
  }
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    processEntities: false,
    isArray: (name) => name === "User" || name === "Server",
  }).parse(xml);
  const container = record(record(parsed).MediaContainer);
  const users: unknown[] = Array.isArray(container.User) ? container.User : [];
  const size = text(container.size);
  if (
    !/^\d+$/.test(size) ||
    Number(size) !== users.length ||
    (container.offset !== undefined && container.offset !== "0") ||
    (container.totalSize !== undefined &&
      Number(container.totalSize) !== users.length)
  )
    throw new AppError(
      "Plex returned an incomplete user list. No membership changes were applied.",
      502
    );
  const members: PlexMember[] = [];
  const seen = new Set<string>();
  for (const item of users) {
    const user = record(item);
    const accountId = accountIdOf(user.id);
    if (seen.has(accountId))
      throw new AppError("Plex returned duplicate accounts", 502);
    seen.add(accountId);
    // Managed profiles have no independent username/email. Do not use 'restricted': full accounts may be restricted too.
    if (!text(user.username) && !text(user.email)) continue;
    const shares = Array.isArray(user.Server) ? user.Server : [];
    const matched = shares.some((item) => {
      const share = record(item);
      if (!text(share.machineIdentifier))
        throw new AppError("Plex returned an invalid server share", 502);
      if (
        share.pending !== undefined &&
        !["0", "1", "false", "true"].includes(text(share.pending))
      )
        throw new AppError("Plex returned an invalid invitation status", 502);
      return (
        share.machineIdentifier === serverId &&
        share.pending !== "1" &&
        share.pending !== "true"
      );
    });
    if (matched)
      members.push({
        accountId,
        username: (
          text(user.username) ||
          text(user.title) ||
          `plex-${accountId}`
        ).slice(0, 255),
      });
  }
  return members;
}

export async function connectPlexOwner(
  token: string,
  ownerId: string,
  ownerName: string,
  adminId: number,
  checkFlow: () => void
): Promise<void> {
  const servers = await ownedServers(token);
  if (!servers.length)
    throw new AppError(
      "This Plex account does not own a Plex Media Server",
      403
    );
  const encryptedToken = encryptPlexToken(token);
  await dbWriteTransaction("plex-connect", async (tx) => {
    checkFlow();
    const admin = await tx.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.disabled || admin.role !== "ADMIN")
      throw new AppError("Administrator access required", 403);
    const existing = await tx.plexConnection.findUnique({ where: { id: 1 } });
    const selected =
      existing?.ownerId === ownerId
        ? servers.find((s) => s.id === existing.serverId)
        : undefined;
    if (!selected)
      await tx.plexIdentity.updateMany({
        data: { serverMember: false, approved: false },
      });
    await tx.plexConnection.upsert({
      where: { id: 1 },
      create: { ownerId, ownerName, encryptedToken, revision: randomUUID() },
      update: {
        ownerId,
        ownerName,
        encryptedToken,
        revision: randomUUID(),
        serverId: selected?.id ?? null,
        serverName: selected?.name ?? null,
        lastError: null,
        ...(selected ? {} : { lastSyncedAt: null }),
      },
    });
    checkFlow();
  });
}

export async function plexConnectionStatus() {
  const connection = await prisma.plexConnection.findUnique({
    where: { id: 1 },
  });
  return {
    connected: !!connection?.encryptedToken,
    ownerName: connection?.ownerName ?? null,
    serverId: connection?.serverId ?? null,
    serverName: connection?.serverName ?? null,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
    lastError: connection?.lastError ?? null,
    syncIntervalMinutes: 30,
  };
}

async function connectionRequired(): Promise<
  PlexConnection & { encryptedToken: string }
> {
  const value = await prisma.plexConnection.findUnique({ where: { id: 1 } });
  if (!value?.encryptedToken)
    throw new AppError("Connect a Plex owner account first", 400);
  return { ...value, encryptedToken: value.encryptedToken };
}
export async function listPlexServers() {
  const connection = await connectionRequired();
  return ownedServers(decryptPlexToken(connection.encryptedToken));
}

export async function selectPlexServer(serverId: string) {
  const connection = await connectionRequired();
  const server = (
    await ownedServers(decryptPlexToken(connection.encryptedToken))
  ).find((s) => s.id === serverId);
  if (!server)
    throw new AppError(
      "Select a server owned by the connected Plex account",
      400
    );
  await dbWriteTransaction("plex-select-server", async (tx) => {
    const current = await tx.plexConnection.findUnique({ where: { id: 1 } });
    if (current?.revision !== connection.revision)
      throw new AppError("Plex connection changed. Try again.", 409);
    if (current.serverId !== serverId) {
      await tx.plexIdentity.updateMany({
        data: { serverMember: false, approved: false },
      });
      await tx.plexConnection.update({
        where: { id: 1 },
        data: {
          serverId,
          serverName: server.name,
          revision: randomUUID(),
          lastSyncedAt: null,
          lastError: null,
        },
      });
    }
  });
  return syncPlexUsers();
}

let syncing: Promise<{ imported: number; members: number }> | undefined;
async function performSync() {
  const connection = await connectionRequired();
  if (!connection.serverId)
    throw new AppError("Select a Plex server first", 400);
  try {
    const token = decryptPlexToken(connection.encryptedToken);
    const account = record(
      JSON.parse(await request("/api/v2/user", token)) as unknown
    );
    if (accountIdOf(account.id) !== connection.ownerId)
      throw new AppError("Plex owner identity changed. Reconnect Plex.", 403);
    if (!(await ownedServers(token)).some((s) => s.id === connection.serverId))
      throw new AppError(
        "The connected account no longer owns the selected server",
        403
      );
    const members = parsePlexMembers(
      await request("/api/users/", token, true),
      connection.serverId
    );
    if (!members.some((m) => m.accountId === connection.ownerId))
      members.push({
        accountId: connection.ownerId,
        username: connection.ownerName,
      });
    // Validate the complete remote snapshot before taking the writer. Small batches keep user writes responsive.
    let imported = 0;
    for (let offset = 0; offset < members.length; offset += 25) {
      const batch = members.slice(offset, offset + 25);
      imported += await dbWriteTransaction("plex-import-users", async (tx) => {
        const current = await tx.plexConnection.findUnique({
          where: { id: 1 },
        });
        if (current?.revision !== connection.revision)
          throw new AppError("Plex connection changed during sync", 409);
        let created = 0;
        for (const member of batch) {
          let identity = await tx.plexIdentity.findUnique({
            where: { accountId: member.accountId },
          });
          identity ??= await tx.plexIdentity.create({
            data: { accountId: member.accountId },
          });
          if (!identity.userId) {
            const collision = await tx.user.findUnique({
              where: { username: member.username },
            });
            const username = collision
              ? `${member.username.slice(0, 210)} (Plex ${member.accountId})-${randomBytes(3).toString("hex")}`
              : member.username;
            const user = await tx.user.create({
              data: {
                username,
                password: "!plex-only",
                plexOnly: true,
                disabled: true,
                role: "USER",
              },
            });
            await tx.plexIdentity.update({
              where: { accountId: member.accountId },
              data: { userId: user.id, username: member.username },
            });
            created++;
          } else
            await tx.plexIdentity.update({
              where: { accountId: member.accountId },
              data: { username: member.username },
            });
        }
        return created;
      });
    }
    await dbWriteTransaction("plex-sync-membership", async (tx) => {
      const current = await tx.plexConnection.findUnique({ where: { id: 1 } });
      if (current?.revision !== connection.revision)
        throw new AppError("Plex connection changed during sync", 409);
      const ids = members.map((m) => m.accountId);
      await tx.plexIdentity.updateMany({
        where: { accountId: { notIn: ids } },
        data: { serverMember: false, approved: false },
      });
      await tx.plexIdentity.updateMany({
        where: { accountId: { in: ids } },
        data: { serverMember: true },
      });
      await tx.plexConnection.update({
        where: { id: 1 },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
    });
    return { imported, members: members.length };
  } catch {
    await prisma.plexConnection.updateMany({
      where: { id: 1, revision: connection.revision },
      data: {
        lastError:
          "Plex sync failed. Membership was not replaced. Check the connection and try Sync now.",
      },
    });
    throw new AppError(
      "Plex sync failed. Existing access settings were preserved. Check the connection or reconnect Plex.",
      502
    );
  }
}

export function syncPlexUsers(): Promise<{
  imported: number;
  members: number;
}> {
  if (!syncing) {
    syncAbort = new AbortController();
    syncing = performSync().finally(() => {
      syncing = undefined;
      syncAbort = undefined;
    });
  }
  return syncing;
}

export async function stopPlexRequests(): Promise<void> {
  syncAbort?.abort();
  await syncing?.catch(() => {});
}

export async function disconnectPlex() {
  await dbWriteTransaction("plex-disconnect", async (tx) => {
    await tx.plexConnection.updateMany({
      where: { id: 1 },
      data: { encryptedToken: null, revision: randomUUID(), lastError: null },
    });
    await tx.plexIdentity.updateMany({
      data: { serverMember: false, approved: false },
    });
  });
}

export async function setPlexActive(
  accountId: string,
  active: boolean,
  adminId: number
) {
  await dbWriteTransaction("plex-active", async (tx) => {
    const identity = await tx.plexIdentity.findUnique({
      where: { accountId },
      include: { user: true },
    });
    const connection = await tx.plexConnection.findUnique({ where: { id: 1 } });
    if (!identity?.user)
      throw new AppError("Import this Plex account first", 400);
    if (identity.user.id === adminId)
      throw new AppError(
        "Use another administrator to change your own Plex access",
        400
      );
    if (
      active &&
      (!connection?.encryptedToken ||
        !connection.serverId ||
        !identity.serverMember)
    )
      throw new AppError(
        "This account has no verified access to the selected Plex server",
        400
      );
    await tx.plexIdentity.update({
      where: { accountId },
      data: { approved: active },
    });
    // A linked local profile keeps its local recovery path. Deactivate the entire account separately if required.
    if (identity.user.plexOnly || active)
      await tx.user.update({
        where: { id: identity.user.id },
        data: { disabled: !active },
      });
  });
}
