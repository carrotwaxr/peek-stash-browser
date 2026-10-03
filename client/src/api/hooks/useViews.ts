import type {
  DeleteFilterPresetResponse,
  OverwriteViewBody,
  RenameViewBody,
  SaveFilterPresetBody,
  SaveFilterPresetResponse,
  SetDefaultFilterPresetResponse,
} from "@peek/shared-types";
import { VIEW_NAME_TAKEN } from "@peek/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiPatch, apiPost, apiPut } from "..";
import { ApiError } from "../client";
import { invalidatePresets } from "./usePresets";

/**
 * The server's message for a name another View of the list has (shared, so
 * both sides read one string). Its other 409, a write
 * that lost the compare-and-set to another tab's (`updateUserJson`), says
 * something else; both are `errorType: "CONFLICT"`, so the message tells
 * them apart.
 */
export { VIEW_NAME_TAKEN };

/**
 * Why a Views write was refused with a 409: `nameTaken`, another View of the
 * list has the name; `stale`, the user's Views changed elsewhere (another
 * tab saved first) and the list is read again
 */
export type ViewConflict = "nameTaken" | "stale";

/**
 * What a Views write resolves to: the server's answer, or `{ conflict: true,
 * reason }` for a 409. A conflict is an answer the dialog shows, not a thrown
 * error; every other failure still rejects. Whatever the answer, both
 * preset queries are read again.
 */
export type ViewWriteResult<T> =
  | { conflict: false; data: T }
  | { conflict: true; reason: ViewConflict };

const conflictOf = (error: ApiError): ViewConflict =>
  (error.data.error ?? error.message) === VIEW_NAME_TAKEN
    ? "nameTaken"
    : "stale";

async function writeView<T>(request: Promise<T>): Promise<ViewWriteResult<T>> {
  try {
    return { conflict: false, data: await request };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { conflict: true, reason: conflictOf(error) };
    }
    throw error;
  }
}

/** The route of one View: `/user/filter-presets/:artifactType/:presetId` */
const viewPath = (artifactType: string, presetId: string) =>
  `/user/filter-presets/${encodeURIComponent(artifactType)}/${encodeURIComponent(presetId)}`;

/**
 * A Views write, then both preset queries marked stale and read again,
 * whatever the answer: a refused write (a 404 for a View another tab
 * deleted) still shows the Views as the server holds them
 */
function useViewMutation<Variables, T>(
  write: (variables: Variables) => Promise<T>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Variables) => writeView(write(variables)),
    onSettled: () => invalidatePresets(queryClient),
  });
}

/** Save as new: `POST /user/filter-presets` */
export function useSaveView() {
  return useViewMutation((body: SaveFilterPresetBody) =>
    apiPost<SaveFilterPresetResponse>("/user/filter-presets", body)
  );
}

export interface ViewRef {
  artifactType: string;
  presetId: string;
}

/** Save changes to a View: `PUT /user/filter-presets/:artifactType/:presetId` */
export function useOverwriteView() {
  return useViewMutation(
    ({ artifactType, presetId, body }: ViewRef & { body: OverwriteViewBody }) =>
      apiPut<SaveFilterPresetResponse>(viewPath(artifactType, presetId), body)
  );
}

/** Rename a View: `PATCH /user/filter-presets/:artifactType/:presetId` */
export function useRenameView() {
  return useViewMutation(
    ({ artifactType, presetId, name }: ViewRef & RenameViewBody) =>
      apiPatch<SaveFilterPresetResponse>(viewPath(artifactType, presetId), {
        name,
      })
  );
}

/** Delete a View, and every default that names it: `DELETE /user/filter-presets/...` */
export function useDeleteView() {
  return useViewMutation(({ artifactType, presetId }: ViewRef) =>
    apiDelete<DeleteFilterPresetResponse>(viewPath(artifactType, presetId))
  );
}

/** Set a context's default View, or clear it with `presetId: null` */
export function useSetDefaultView() {
  return useViewMutation((body: { context: string; presetId: string | null }) =>
    apiPut<SetDefaultFilterPresetResponse>("/user/default-preset", body)
  );
}
