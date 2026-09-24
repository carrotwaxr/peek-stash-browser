/**
 * Stand-in for `prisma/singleton.js`. Use it as
 * `vi.mock("../../prisma/singleton.js", () => import("../helpers/prismaSingletonMock.js"))`,
 * then `const mockPrisma = vi.mocked(prisma, true)`.
 */
import { vi } from "vitest";
import { createPrismaMock } from "./prismaMock.js";

export const configureSQLite = vi.fn();

export default createPrismaMock();
