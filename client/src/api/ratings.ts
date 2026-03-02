/**
 * Ratings API — rating and favorite update endpoints.
 */
import { apiFetch } from "./client";
import type { UpdateRatingRequest, UpdateRatingResponse } from "@peek/shared-types";

export function updateSceneRating(sceneId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/scene/${sceneId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updatePerformerRating(performerId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/performer/${performerId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateStudioRating(studioId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/studio/${studioId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateTagRating(tagId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/tag/${tagId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateGalleryRating(galleryId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/gallery/${galleryId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateGroupRating(groupId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/group/${groupId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function updateImageRating(imageId: string, data: UpdateRatingRequest): Promise<UpdateRatingResponse> {
  return apiFetch(`/ratings/image/${imageId}`, { method: "PUT", body: JSON.stringify(data) });
}
