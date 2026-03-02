// Re-exporting stub — canonical definitions live in shared/types/api/clips.ts
export type {
  GetClipsQuery,
  GetClipsResponse,
  GetClipByIdParams,
  GetClipsForSceneParams,
  GetClipsForSceneQuery,
  GetClipsForSceneResponse,
} from "@peek/shared-types/api/clips.js";

// Server-internal: depends on ClipService (not movable to shared)
export type { ClipWithRelations as GetClipByIdResponse } from "../../services/ClipService.js";
