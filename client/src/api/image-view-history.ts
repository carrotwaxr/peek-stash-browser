/**
 * Image view history API endpoints.
 */
import { apiGet, apiPost } from "./client";

export const imageViewHistoryApi = {
  incrementO: (imageId: string, instanceId?: string) =>
    apiPost("/image-view-history/increment-o", { imageId, ...(instanceId && { instanceId }) }),

  recordView: (imageId: string, instanceId?: string) =>
    apiPost("/image-view-history/view", { imageId, ...(instanceId && { instanceId }) }),

  getViewHistory: (imageId: string, instanceId?: string) =>
    apiGet(`/image-view-history/${imageId}${instanceId ? `?instanceId=${instanceId}` : ""}`),
};
