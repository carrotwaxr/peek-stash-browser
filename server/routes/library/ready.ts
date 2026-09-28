import express from "express";
import { authenticate, isLibraryReady } from "../../middleware/auth.js";
import type {
  LibraryReadyResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

/**
 * Whether the user's library can be shown yet: the test `requireCacheReady`
 * answers 503 `ready: false` on. The client re-checks it every 5 seconds
 * while the library is initializing, and loads the library once it is true.
 */
export const getLibraryReady = async (
  req: TypedAuthRequest,
  res: TypedResponse<LibraryReadyResponse>
) => {
  res.json({ ready: await isLibraryReady(req.user.id) });
};

router.get("/ready", authenticate, authenticated(getLibraryReady));

export default router;
