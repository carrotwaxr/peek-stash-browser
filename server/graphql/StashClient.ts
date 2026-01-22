/**
 * StashClient - Internal GraphQL client for Stash API
 *
 * Replaces the external stashapp-api package with an internal implementation.
 * Uses graphql-request and generated SDK from codegen.
 */
import { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql.js";

export interface StashClientConfig {
  url: string;
  apiKey: string;
}

/**
 * Client for interacting with the Stash GraphQL API.
 * Each instance maintains its own connection configuration.
 */
export class StashClient {
  private client: GraphQLClient;
  private sdk: ReturnType<typeof getSdk>;

  constructor(config: StashClientConfig) {
    this.client = new GraphQLClient(config.url, {
      headers: { ApiKey: config.apiKey },
    });
    this.sdk = getSdk(this.client);
  }

  // Find operations
  findPerformers = (...args: Parameters<ReturnType<typeof getSdk>["FindPerformers"]>) =>
    this.sdk.FindPerformers(...args);
  findStudios = (...args: Parameters<ReturnType<typeof getSdk>["FindStudios"]>) =>
    this.sdk.FindStudios(...args);
  findScenes = (...args: Parameters<ReturnType<typeof getSdk>["FindScenes"]>) =>
    this.sdk.FindScenes(...args);
  findScenesCompact = (...args: Parameters<ReturnType<typeof getSdk>["FindScenesCompact"]>) =>
    this.sdk.FindScenesCompact(...args);
  findTags = (...args: Parameters<ReturnType<typeof getSdk>["FindTags"]>) =>
    this.sdk.FindTags(...args);
  findGroups = (...args: Parameters<ReturnType<typeof getSdk>["FindGroups"]>) =>
    this.sdk.FindGroups(...args);
  findGroup = (...args: Parameters<ReturnType<typeof getSdk>["FindGroup"]>) =>
    this.sdk.FindGroup(...args);
  findGalleries = (...args: Parameters<ReturnType<typeof getSdk>["FindGalleries"]>) =>
    this.sdk.FindGalleries(...args);
  findGallery = (...args: Parameters<ReturnType<typeof getSdk>["FindGallery"]>) =>
    this.sdk.FindGallery(...args);
  findImages = (...args: Parameters<ReturnType<typeof getSdk>["FindImages"]>) =>
    this.sdk.FindImages(...args);
  findSceneMarkers = (...args: Parameters<ReturnType<typeof getSdk>["FindSceneMarkers"]>) =>
    this.sdk.FindSceneMarkers(...args);

  // ID-only find operations (for cleanup/deletion detection)
  findSceneIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindSceneIDs"]>) =>
    this.sdk.FindSceneIDs(...args);
  findPerformerIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindPerformerIDs"]>) =>
    this.sdk.FindPerformerIDs(...args);
  findStudioIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindStudioIDs"]>) =>
    this.sdk.FindStudioIDs(...args);
  findTagIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindTagIDs"]>) =>
    this.sdk.FindTagIDs(...args);
  findGroupIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindGroupIDs"]>) =>
    this.sdk.FindGroupIDs(...args);
  findGalleryIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindGalleryIDs"]>) =>
    this.sdk.FindGalleryIDs(...args);
  findImageIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindImageIDs"]>) =>
    this.sdk.FindImageIDs(...args);

  // Update operations
  sceneUpdate = (...args: Parameters<ReturnType<typeof getSdk>["sceneUpdate"]>) =>
    this.sdk.sceneUpdate(...args);
  scenesUpdate = (...args: Parameters<ReturnType<typeof getSdk>["scenesUpdate"]>) =>
    this.sdk.scenesUpdate(...args);
  performerUpdate = (...args: Parameters<ReturnType<typeof getSdk>["performerUpdate"]>) =>
    this.sdk.performerUpdate(...args);
  studioUpdate = (...args: Parameters<ReturnType<typeof getSdk>["studioUpdate"]>) =>
    this.sdk.studioUpdate(...args);
  galleryUpdate = (...args: Parameters<ReturnType<typeof getSdk>["galleryUpdate"]>) =>
    this.sdk.galleryUpdate(...args);
  groupUpdate = (...args: Parameters<ReturnType<typeof getSdk>["groupUpdate"]>) =>
    this.sdk.groupUpdate(...args);
  imageUpdate = (...args: Parameters<ReturnType<typeof getSdk>["imageUpdate"]>) =>
    this.sdk.imageUpdate(...args);
  tagCreate = (...args: Parameters<ReturnType<typeof getSdk>["tagCreate"]>) =>
    this.sdk.tagCreate(...args);
  tagUpdate = (...args: Parameters<ReturnType<typeof getSdk>["tagUpdate"]>) =>
    this.sdk.tagUpdate(...args);

  // Destroy operations
  performerDestroy = (...args: Parameters<ReturnType<typeof getSdk>["performerDestroy"]>) =>
    this.sdk.performerDestroy(...args);
  performersDestroy = (...args: Parameters<ReturnType<typeof getSdk>["performersDestroy"]>) =>
    this.sdk.performersDestroy(...args);
  tagDestroy = (...args: Parameters<ReturnType<typeof getSdk>["tagDestroy"]>) =>
    this.sdk.tagDestroy(...args);
  tagsDestroy = (...args: Parameters<ReturnType<typeof getSdk>["tagsDestroy"]>) =>
    this.sdk.tagsDestroy(...args);
  studioDestroy = (...args: Parameters<ReturnType<typeof getSdk>["studioDestroy"]>) =>
    this.sdk.studioDestroy(...args);
  studiosDestroy = (...args: Parameters<ReturnType<typeof getSdk>["studiosDestroy"]>) =>
    this.sdk.studiosDestroy(...args);
  sceneDestroy = (...args: Parameters<ReturnType<typeof getSdk>["sceneDestroy"]>) =>
    this.sdk.sceneDestroy(...args);

  // Activity operations
  sceneIncrementO = (...args: Parameters<ReturnType<typeof getSdk>["sceneIncrementO"]>) =>
    this.sdk.sceneIncrementO(...args);
  sceneDecrementO = (...args: Parameters<ReturnType<typeof getSdk>["SceneDecrementO"]>) =>
    this.sdk.SceneDecrementO(...args);
  sceneSaveActivity = (...args: Parameters<ReturnType<typeof getSdk>["SceneSaveActivity"]>) =>
    this.sdk.SceneSaveActivity(...args);
  sceneAddPlay = (...args: Parameters<ReturnType<typeof getSdk>["SceneAddPlay"]>) =>
    this.sdk.SceneAddPlay(...args);

  // Configuration
  configuration = (...args: Parameters<ReturnType<typeof getSdk>["Configuration"]>) =>
    this.sdk.Configuration(...args);

  // Metadata operations
  metadataScan = (...args: Parameters<ReturnType<typeof getSdk>["metadataScan"]>) =>
    this.sdk.metadataScan(...args);
}
