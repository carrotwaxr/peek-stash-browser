/**
 * The Content Restrictions editor's pickers (task L3): an admin restricts
 * content on every enabled Stash server, whichever servers they browse.
 *
 * `scope: "allEnabled"` on `POST /library/<entities>/minimal` lists every
 * live entity on every enabled instance past its first sync, in place of
 * the admin's own selection, and what the admin hid for themselves with it
 * (task L4, owner 2026-09-28: an admin may restrict another user from what
 * they hid). Deleted entities stay out, the admin's hides still apply
 * without the scope, and a USER sending the scope gets 403.
 *
 * On the access fixture (helpers/accessFixture.ts: A and B enabled and
 * synced, OFF disabled), which has SAME on A and B for each of the five
 * types, and the tags HIDDEN_A and VISIBLE_A on A. Added here: SAME on OFF
 * for each type, and the tag DELETED on A, soft-deleted. The admin selects
 * A only and hides the tag HIDDEN_A@A.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import type { ApiErrorResponse, MinimalEntity } from "../../types/api/index.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

/** The five picker endpoints; each answers its rows under its own name */
const PICKERS = [
  "performers",
  "studios",
  "tags",
  "groups",
  "galleries",
] as const;
type Picker = (typeof PICKERS)[number];

type PickerResponse = Partial<Record<Picker, MinimalEntity[]>> &
  ApiErrorResponse;

const refs = (rows: readonly MinimalEntity[] | undefined) =>
  (rows ?? []).map((r) => `${r.id}:${r.instanceId}`);

const ref = (id: string, instanceId: string) => `${id}:${instanceId}`;

describe("Picker scope allEnabled (integration)", () => {
  let scopeAdmin: { id: number; client: TestClient };
  let plainUser: { id: number; client: TestClient };

  async function pick(
    client: TestClient,
    picker: Picker,
    body: object
  ): Promise<{ status: number; data: PickerResponse }> {
    return client.post<PickerResponse>(`/api/library/${picker}/minimal`, body);
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();

    // SAME on the disabled instance, for each type
    const onOff = { id: FX_ID.SAME, stashInstanceId: FX.OFF };
    const named = { ...onOff, name: `OFF-${FX_ID.SAME}` };
    await prisma.stashPerformer.create({ data: named });
    await prisma.stashStudio.create({ data: named });
    await prisma.stashTag.create({ data: named });
    await prisma.stashGroup.create({ data: named });
    await prisma.stashGallery.create({
      data: { ...onOff, title: `OFF-${FX_ID.SAME}` },
    });

    // A tag sync soft-deleted
    await prisma.stashTag.create({
      data: {
        id: FX_ID.DELETED,
        stashInstanceId: FX.A,
        name: `A-${FX_ID.DELETED}`,
        deletedAt: new Date(),
      },
    });

    scopeAdmin = await createApiUser(
      "access_it_scope_admin",
      "access_it_pass_1",
      "ADMIN"
    );
    await prisma.userStashInstance.create({
      data: { userId: scopeAdmin.id, instanceId: FX.A },
    });
    await hideFor(scopeAdmin.id, "tag", FX_ID.HIDDEN_A, FX.A);

    plainUser = await createApiUser("access_it_scope_user", "access_it_pass_1");
  }, 60000);

  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it("an admin who selected only instance A picks B's tags in the restrictions editor with scope allEnabled", async () => {
    // The live tags on A and B, the admin's own hide included; nothing on OFF
    const tags = await pick(scopeAdmin.client, "tags", {
      filter: { q: "-7700" },
      scope: "allEnabled",
    });
    expect(tags.status).toBe(200);
    expect(refs(tags.data.tags)).toEqual([
      ref(FX_ID.SAME, FX.A),
      ref(FX_ID.HIDDEN_A, FX.A),
      ref(FX_ID.VISIBLE_A, FX.A),
      ref(FX_ID.SAME, FX.B),
    ]);

    // A stored restriction on B resolves to its name (the editor's chips)
    const chip = await pick(scopeAdmin.client, "tags", {
      ids: [ref(FX_ID.SAME, FX.B)],
      scope: "allEnabled",
    });
    expect(chip.status).toBe(200);
    expect(chip.data.tags).toEqual([
      { id: FX_ID.SAME, instanceId: FX.B, name: `B-${FX_ID.SAME}` },
    ]);

    // Each of the five pickers lists B's entity, never OFF's
    for (const picker of PICKERS) {
      const res = await pick(scopeAdmin.client, picker, {
        filter: { q: FX_ID.SAME },
        scope: "allEnabled",
      });
      expect(res.status, picker).toBe(200);
      expect(refs(res.data[picker]), picker).toEqual([
        ref(FX_ID.SAME, FX.A),
        ref(FX_ID.SAME, FX.B),
      ]);
    }
  });

  it("an admin who hid a tag picks it in the restrictions editor with scope allEnabled", async () => {
    // The hide is in UserExcludedEntity, as every other surface reads it
    const excluded = await prisma.userExcludedEntity.findUnique({
      where: {
        userId_entityType_entityId_instanceId: {
          userId: scopeAdmin.id,
          entityType: "tag",
          entityId: FX_ID.HIDDEN_A,
          instanceId: FX.A,
        },
      },
    });
    expect(excluded?.reason).toBe("hidden");

    const search = await pick(scopeAdmin.client, "tags", {
      filter: { q: FX_ID.HIDDEN_A },
      scope: "allEnabled",
    });
    expect(search.status).toBe(200);
    expect(refs(search.data.tags)).toEqual([ref(FX_ID.HIDDEN_A, FX.A)]);

    // A stored restriction on the hidden tag resolves to its name
    const chip = await pick(scopeAdmin.client, "tags", {
      ids: [ref(FX_ID.HIDDEN_A, FX.A)],
      scope: "allEnabled",
    });
    expect(chip.status).toBe(200);
    expect(chip.data.tags).toEqual([
      { id: FX_ID.HIDDEN_A, instanceId: FX.A, name: `A-${FX_ID.HIDDEN_A}` },
    ]);
  });

  it("without scope, the admin's hidden tag stays out of the picker", async () => {
    const search = await pick(scopeAdmin.client, "tags", {
      filter: { q: FX_ID.HIDDEN_A },
    });
    expect(search.status).toBe(200);
    expect(refs(search.data.tags)).toEqual([]);

    const chip = await pick(scopeAdmin.client, "tags", {
      ids: [ref(FX_ID.HIDDEN_A, FX.A)],
    });
    expect(chip.status).toBe(200);
    expect(chip.data.tags).toEqual([]);
  });

  it("with scope allEnabled, a deleted tag stays out", async () => {
    const search = await pick(scopeAdmin.client, "tags", {
      filter: { q: FX_ID.DELETED },
      scope: "allEnabled",
    });
    expect(search.status).toBe(200);
    expect(refs(search.data.tags)).toEqual([]);

    const chip = await pick(scopeAdmin.client, "tags", {
      ids: [ref(FX_ID.DELETED, FX.A)],
      scope: "allEnabled",
    });
    expect(chip.status).toBe(200);
    expect(chip.data.tags).toEqual([]);
  });

  it("with scope allEnabled, an instance on its first sync stays out", async () => {
    await prisma.stashInstance.update({
      where: { id: FX.B },
      data: { firstSyncedAt: null },
    });
    try {
      const res = await pick(scopeAdmin.client, "tags", {
        filter: { q: FX_ID.SAME },
        scope: "allEnabled",
      });
      expect(res.status).toBe(200);
      expect(refs(res.data.tags)).toEqual([ref(FX_ID.SAME, FX.A)]);
    } finally {
      await prisma.stashInstance.update({
        where: { id: FX.B },
        data: { firstSyncedAt: new Date() },
      });
    }
  });

  it("a USER sending scope allEnabled gets 403", async () => {
    for (const picker of PICKERS) {
      const res = await pick(plainUser.client, picker, {
        filter: { q: FX_ID.SAME },
        scope: "allEnabled",
      });
      expect(res.status, picker).toBe(403);
      expect(res.data.errorType, picker).toBe("FORBIDDEN");
      expect(res.data[picker], picker).toBeUndefined();
    }

    // The same request without the scope is answered
    const res = await pick(plainUser.client, "tags", {
      filter: { q: FX_ID.SAME },
    });
    expect(res.status).toBe(200);
  });

  it("without scope, the admin's picker keeps the admin's own selection", async () => {
    const tags = await pick(scopeAdmin.client, "tags", {
      filter: { q: "-7700" },
    });
    expect(tags.status).toBe(200);
    expect(refs(tags.data.tags)).toEqual([
      ref(FX_ID.SAME, FX.A),
      ref(FX_ID.VISIBLE_A, FX.A),
    ]);

    // B's entity does not resolve outside the admin's selection
    const chip = await pick(scopeAdmin.client, "tags", {
      ids: [ref(FX_ID.SAME, FX.B)],
    });
    expect(chip.status).toBe(200);
    expect(chip.data.tags).toEqual([]);
  });
});
