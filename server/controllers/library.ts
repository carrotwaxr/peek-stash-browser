import {
  CriterionModifier,
  Scene,
  SceneFilterType,
  PerformerFilterType,
  StudioFilterType,
  TagFilterType,
} from "stashapp-api";
import { Request, Response } from "express";
import getStash from "../stash.js";
import {
  FindScenesQuery,
  FindPerformersQuery,
  FindStudiosQuery,
  FindTagsQuery,
  FindFilterType,
} from "stashapp-api/dist/generated/graphql.js";

export const getSceneLibrary = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const scenes: FindScenesQuery = await stash.findScenes({
      filter: { per_page: 5 },
      scene_filter: {
        rating100: { modifier: CriterionModifier.GreaterThan, value: 80 },
        performer_favorite: true,
      },
    });

    const mutatedScenes = scenes.findScenes.scenes.map((s) =>
      transformScene(s as Scene)
    );

    res.json({
      ...scenes,
      findScenes: { ...scenes.findScenes, scenes: mutatedScenes },
    });
  } catch (error) {
    console.error("Error in getVideoLibrary:", error);
    res.status(500).json({
      error: "Failed to fetch video library",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// New POST endpoints for filtered searching

export const findScenes = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, scene_filter, ids } = req.body;

    const scenes: FindScenesQuery = await stash.findScenes({
      filter: filter as FindFilterType,
      scene_filter: scene_filter as SceneFilterType,
      ids: ids as string[],
    });

    const mutatedScenes = scenes.findScenes.scenes.map((s) =>
      transformScene(s as Scene)
    );

    res.json({
      ...scenes,
      findScenes: { ...scenes.findScenes, scenes: mutatedScenes },
    });
  } catch (error) {
    console.error("Error in findScenes:", error);
    res.status(500).json({
      error: "Failed to find scenes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findPerformers = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, performer_filter } = req.body;

    const performers: FindPerformersQuery = await stash.findPerformers({
      filter: filter as FindFilterType,
      performer_filter: performer_filter as PerformerFilterType,
    });

    res.json(performers);
  } catch (error) {
    console.error("Error in findPerformers:", error);
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findStudios = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, studio_filter } = req.body;

    const studios: FindStudiosQuery = await stash.findStudios({
      filter: filter as FindFilterType,
      studio_filter: studio_filter as StudioFilterType,
    });

    res.json(studios);
  } catch (error) {
    console.error("Error in findStudios:", error);
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findTags = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, tag_filter } = req.body;

    const tags: FindTagsQuery = await stash.findTags({
      filter: filter as FindFilterType,
      tag_filter: tag_filter as TagFilterType,
    });

    res.json(tags);
  } catch (error) {
    console.error("Error in findTags:", error);
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const transformScene = (scene: Scene) => {
  try {
    const mutated: Record<string, any> = {
      ...scene,
      paths: Object.entries(scene.paths).reduce((acc, [key, val]) => {
        try {
          // Skip null, undefined, or empty values
          if (!val || typeof val !== "string" || val.trim() === "") {
            acc[key] = val as string; // Keep original value (could be null)
            return acc;
          }

          const urlString = val as string;
          const url = new URL(urlString);
          if (!url.searchParams.has("apikey")) {
            const apiKey = process.env.STASH_API_KEY;
            if (!apiKey) {
              console.error("STASH_API_KEY not found in environment variables");
              acc[key] = urlString; // Return original if no API key
              return acc;
            }
            url.searchParams.append("apikey", apiKey);
          }
          acc[key] = url.toString();
          return acc;
        } catch (urlError) {
          console.error(`Error processing URL for ${key}: ${val}`, urlError);
          acc[key] = val as string; // Return original URL if parsing fails
          return acc;
        }
      }, {} as { [key: string]: string }),
    };

    return mutated;
  } catch (error) {
    console.error("Error transforming scene:", error);
    return scene; // Return original scene if transformation fails
  }
};
