import type { User } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createPrismaMock, partialRow } from "./prismaMock.js";

describe("createPrismaMock", () => {
  it("returns the same vi.fn on repeated access and records calls", async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);

    expect(prisma.user.findUnique).toBe(prisma.user.findUnique);
    expect(prisma.$queryRawUnsafe).toBe(prisma.$queryRawUnsafe);
    expect(vi.isMockFunction(prisma.user.findUnique)).toBe(true);
    await expect(
      prisma.user.findUnique({ where: { id: 1 } })
    ).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("is not thenable", async () => {
    const prisma = createPrismaMock();

    expect(Reflect.get(prisma, "then")).toBeUndefined();
    // A module default export and an awaited value must be the mock itself
    const mod = await Promise.resolve({ default: prisma });
    expect(mod.default).toBe(prisma);
    await expect(Promise.resolve(prisma)).resolves.toBe(prisma);
  });

  it("$transaction resolves an array of calls in order and runs a callback with the mock, also after vi.resetAllMocks()", async () => {
    const prisma = createPrismaMock();
    prisma.user.count.mockResolvedValue(3);
    prisma.user.findMany.mockResolvedValue([]);

    await expect(
      prisma.$transaction([prisma.user.count(), prisma.user.findMany()])
    ).resolves.toEqual([3, []]);
    await expect(
      prisma.$transaction((tx) => Promise.resolve(tx === prisma))
    ).resolves.toBe(true);

    vi.resetAllMocks();
    prisma.user.count.mockResolvedValue(5);
    prisma.user.findMany.mockResolvedValue([]);

    await expect(
      prisma.$transaction([prisma.user.findMany(), prisma.user.count()])
    ).resolves.toEqual([[], 5]);
    await expect(
      prisma.$transaction((tx) => Promise.resolve(tx === prisma))
    ).resolves.toBe(true);
  });

  it("partialRow keeps the given fields", async () => {
    const prisma = createPrismaMock();
    const row = partialRow<User>({ id: 7, username: "alice" });
    prisma.user.findUnique.mockResolvedValue(row);

    expect(row).toEqual({ id: 7, username: "alice" });
    await expect(prisma.user.findUnique({ where: { id: 7 } })).resolves.toBe(
      row
    );
  });
});
