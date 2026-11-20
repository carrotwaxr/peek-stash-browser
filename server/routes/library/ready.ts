import express from "express";
import { authenticate, libraryReadiness } from "../../middleware/auth.js";
import type {
  LibraryReadyResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

/**
 * Whether the user's library can be shown yet: the test `requireCacheReady`
 * answers 503 `ready: false` on, with `reason` when it is not ready. The
 * client re-checks it every 5 seconds while the library is not ready, and
 * loads the library once it is true.
 */
export const getLibraryReady = async (
  req: TypedAuthRequest,
  res: TypedResponse<LibraryReadyResponse>
) => {
  res.json(await libraryReadiness(req.user.id));
};

router.get("/ready", authenticate, authenticated(getLibraryReady));

export default router;
