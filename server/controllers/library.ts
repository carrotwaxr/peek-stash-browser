import { CriterionModifier, Scene } from "stashapp-api";
import { Request, Response } from "express";
import getStash from "../stash.js";
import { FindScenesQuery } from "stashapp-api/dist/generated/graphql.js";

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
