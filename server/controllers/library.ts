import {
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
import {
  transformScene,
  transformPerformer,
  transformStudio,
  transformTag,
} from "../utils/pathMapping.js";

// New POST endpoints for filtered searching

export const findScenes = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, scene_filter, ids, scene_ids } = req.body;

    const scenes: FindScenesQuery = await stash.findScenes({
      filter: filter as FindFilterType,
      scene_filter: scene_filter as SceneFilterType,
      ids: ids as string[],
      scene_ids: scene_ids as number[],
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

const removeEmptyValues = (obj: any) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null && v !== "")
  );
};

export const findPerformers = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter, performer_filter, ids, performer_ids } = req.body;

    // Always filter to only show performers with scenes
    const enhancedFilter = {
      ...performer_filter,
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const queryInputs = removeEmptyValues({
      filter: filter as FindFilterType,
      ids: ids as string[],
      performer_ids: performer_ids as number[],
      performer_filter:
        ids || performer_ids
          ? performer_filter
          : (enhancedFilter as PerformerFilterType),
    });

    const performers: FindPerformersQuery = await stash.findPerformers(
      queryInputs
    );

    // Transform performers to add API key to image paths
    const transformedPerformers = {
      ...performers,
      findPerformers: {
        ...performers.findPerformers,
        performers: performers.findPerformers.performers.map((performer) =>
          transformPerformer(performer as any)
        ),
      },
    };

    res.json(transformedPerformers);
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
    const { filter, studio_filter, ids } = req.body;

    // Always filter to only show studios with scenes
    const enhancedFilter = {
      ...studio_filter,
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const studios: FindStudiosQuery = await stash.findStudios({
      filter: filter as FindFilterType,
      studio_filter: enhancedFilter as StudioFilterType,
      ids: ids as string[],
    });

    // Transform studios to add API key to image paths
    const transformedStudios = {
      ...studios,
      findStudios: {
        ...studios.findStudios,
        studios: studios.findStudios.studios.map((studio) =>
          transformStudio(studio as any)
        ),
      },
    };

    res.json(transformedStudios);
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
    const { filter, tag_filter, ids } = req.body;

    // Always filter to only show tags with scenes
    const enhancedFilter = {
      ...tag_filter,
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const tags: FindTagsQuery = await stash.findTags({
      filter: filter as FindFilterType,
      tag_filter: enhancedFilter as TagFilterType,
      ids: ids as string[],
    });

    // Transform tags to add API key to image paths
    const transformedTags = {
      ...tags,
      findTags: {
        ...tags.findTags,
        tags: tags.findTags.tags.map((tag) => transformTag(tag as any)),
      },
    };

    res.json(transformedTags);
  } catch (error) {
    console.error("Error in findTags:", error);
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Transform functions now imported from pathMapping utility

// Minimal data endpoints for filter dropdowns (id + name only)

export const findPerformersMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    // Always filter to only show performers with scenes
    const enhancedFilter = {
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const performers: FindPerformersQuery = await stash.findPerformers({
      filter: filter as FindFilterType,
      performer_filter: enhancedFilter as PerformerFilterType,
    });

    // Return only id and name
    const minimalPerformers = performers.findPerformers.performers.map((p) => ({
      id: p.id,
      name: p.name,
    }));

    res.json({ performers: minimalPerformers });
  } catch (error) {
    console.error("Error in findPerformersMinimal:", error);
    res.status(500).json({
      error: "Failed to find performers",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findStudiosMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    // Always filter to only show studios with scenes
    const enhancedFilter = {
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const studios: FindStudiosQuery = await stash.findStudios({
      filter: filter as FindFilterType,
      studio_filter: enhancedFilter as StudioFilterType,
    });

    // Return only id and name
    const minimalStudios = studios.findStudios.studios.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    res.json({ studios: minimalStudios });
  } catch (error) {
    console.error("Error in findStudiosMinimal:", error);
    res.status(500).json({
      error: "Failed to find studios",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const findTagsMinimal = async (req: Request, res: Response) => {
  try {
    const stash = getStash();
    const { filter } = req.body;

    // Always filter to only show tags with scenes
    const enhancedFilter = {
      scene_count: {
        modifier: "GREATER_THAN" as any,
        value: 0,
      },
    };

    const tags: FindTagsQuery = await stash.findTags({
      filter: filter as FindFilterType,
      tag_filter: enhancedFilter as TagFilterType,
    });

    // Return only id and name
    const minimalTags = tags.findTags.tags.map((t) => ({
      id: t.id,
      name: t.name,
    }));

    res.json({ tags: minimalTags });
  } catch (error) {
    console.error("Error in findTagsMinimal:", error);
    res.status(500).json({
      error: "Failed to find tags",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update endpoints using stashapp-api mutations

export const updateScene = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedScene = await stash.sceneUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, scene: updatedScene.sceneUpdate });
  } catch (error) {
    console.error("Error updating scene:", error);
    res.status(500).json({ error: "Failed to update scene" });
  }
};

export const updatePerformer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedPerformer = await stash.performerUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, performer: updatedPerformer.performerUpdate });
  } catch (error) {
    console.error("Error updating performer:", error);
    res.status(500).json({ error: "Failed to update performer" });
  }
};

export const updateStudio = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedStudio = await stash.studioUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, studio: updatedStudio.studioUpdate });
  } catch (error) {
    console.error("Error updating studio:", error);
    res.status(500).json({ error: "Failed to update studio" });
  }
};

export const updateTag = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const stash = getStash();
    const updatedTag = await stash.tagUpdate({
      input: {
        id,
        ...updateData,
      },
    });

    res.json({ success: true, tag: updatedTag.tagUpdate });
  } catch (error) {
    console.error("Error updating tag:", error);
    res.status(500).json({ error: "Failed to update tag" });
  }
};
