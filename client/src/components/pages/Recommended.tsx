import { useMemo } from "react";
import {
  type GetRecommendedScenesResponse,
  RECOMMENDED_LIMIT,
} from "@peek/shared-types";
import { Info } from "lucide-react";
import { useListFilters } from "../../hooks/useListFilters";
import { useFilterOptions } from "../../hooks/useListOptions";
import { RECOMMENDED_SORT_OPTIONS } from "../../utils/filterConfig";
import { treeCounts } from "../../utils/filterFields";
import { sortOffered } from "../../utils/listQuery";
import EntityListPage from "../list/EntityListPage";
import type {
  ListPageConfig,
  ListPageData,
  ListPageExtras,
} from "../list/listPageConfigs";
import { RECOMMENDED_SOURCE } from "../list/listSources";
import { SCENE_LIST, useSceneListPage } from "../scene-search/sceneList";
import { Tooltip } from "../ui/index";

/** The counts the server sends with an empty result (`GetRecommendedScenesResponse`) */
type RecommendationCriteria = NonNullable<
  GetRecommendedScenesResponse["criteria"]
>;

const RecommendationInfoContent = () => (
  <div className="text-sm max-w-sm">
    <p className="mb-2">
      Scenes are scored based on your ratings, favorites, and watch history.
    </p>
    <p className="mb-1">
      <span className="font-medium">Explicit signals</span> &mdash; Performers,
      studios, and tags you&apos;ve rated 80+ or favorited contribute the most
      weight. Performers are weighted heaviest (5&times;), then studios
      (3&times;), then tags (1&times;).
    </p>
    <p className="mb-1">
      <span className="font-medium">Implicit signals</span> &mdash; Your
      top-engaged entities (top 50% by engagement rank) also contribute,
      weighted by how strongly you engage with them.
    </p>
    <p className="mb-1">
      <span className="font-medium">Freshness</span> &mdash; Unwatched scenes
      get a +30 boost. Scenes watched over 14 days ago get +20. Recently watched
      scenes are deprioritized.
    </p>
    <p>
      <span className="font-medium">Diversity</span> &mdash; Scores are grouped
      into tiers and shuffled within each tier daily, so you see variety even
      among similarly-scored scenes.
    </p>
  </div>
);

// Render criteria feedback for empty state
const renderCriteriaFeedback = (criteria: RecommendationCriteria) => {
  const hasAnyActivity =
    criteria.favoritedPerformers > 0 ||
    criteria.ratedPerformers > 0 ||
    criteria.favoritedStudios > 0 ||
    criteria.ratedStudios > 0 ||
    criteria.favoritedTags > 0 ||
    criteria.ratedTags > 0 ||
    criteria.favoritedScenes > 0 ||
    criteria.ratedScenes > 0 ||
    criteria.rankedEntities > 0;

  if (!hasAnyActivity) {
    return (
      <div className="text-gray-400 text-sm mt-2">
        <p>
          To get personalized suggestions, try favoriting or rating (7.0+)
          performers, studios, tags, or scenes you enjoy. Or just keep watching:
          the performers, studios and tags you watch most count too.
        </p>
      </div>
    );
  }

  return (
    <div className="text-gray-400 text-sm mt-2">
      <p className="mb-2">Your current activity:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>
          {criteria.favoritedPerformers} favorited performer
          {criteria.favoritedPerformers !== 1 ? "s" : ""},{" "}
          {criteria.ratedPerformers} highly-rated
        </li>
        <li>
          {criteria.favoritedStudios} favorited studio
          {criteria.favoritedStudios !== 1 ? "s" : ""}, {criteria.ratedStudios}{" "}
          highly-rated
        </li>
        <li>
          {criteria.favoritedTags} favorited tag
          {criteria.favoritedTags !== 1 ? "s" : ""}, {criteria.ratedTags}{" "}
          highly-rated
        </li>
        <li>
          {criteria.favoritedScenes} favorited scene
          {criteria.favoritedScenes !== 1 ? "s" : ""}, {criteria.ratedScenes}{" "}
          rated scene
          {criteria.ratedScenes !== 1 ? "s" : ""}
        </li>
        <li>
          {criteria.rankedEntities === 1
            ? "1 performer, studio or tag from your viewing"
            : `${criteria.rankedEntities} performers, studios and tags from your viewing`}
        </li>
      </ul>
      <p className="mt-2 italic">
        Tip: Rating more scenes helps us learn your preferences!
      </p>
    </div>
  );
};

/**
 * Recommended's own part over the scene list's (a card opens the scene with
 * the page's scenes as its queue, named "Recommended"): while a search or a
 * filter narrows the list, a notice that it narrows the top 500 only, and
 * the server's empty-state message with the user's activity.
 */
function useRecommendedListPage(data: ListPageData): ListPageExtras {
  const sceneExtras = useSceneListPage(data);
  const { listState, response } = data;
  const filterOptions = useFilterOptions("scene");
  const listFilters = useListFilters("scene", listState, filterOptions);
  const filtering = listState.q !== "" || treeCounts(listFilters.tree).rows > 0;

  const answer = response as
    | Partial<Pick<GetRecommendedScenesResponse, "message" | "criteria">>
    | undefined;
  const message = answer?.message;
  const criteria = answer?.criteria;
  const empty = useMemo(
    () =>
      message
        ? {
            message,
            description: criteria
              ? renderCriteriaFeedback(criteria)
              : "Rate or Favorite more items to get personalized recommendations.",
          }
        : null,
    [message, criteria]
  );

  return {
    ...sceneExtras,
    ...(filtering
      ? {
          notice: (
            <p
              role="status"
              className="text-sm mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              {`Filtering within your top ${RECOMMENDED_LIMIT} recommendations`}
            </p>
          ),
        }
      : {}),
    ...(empty ? { empty } : {}),
  };
}

/** Recommended's sorts: its rank first, then the scene sorts the filters allow */
const recommendedSortOptions = (filters: Record<string, unknown>) =>
  RECOMMENDED_SORT_OPTIONS.filter(
    (option) => sortOffered("scene", option.value, filters) === option.value
  );

// The scene list without its folder view: Recommended has no timeline or
// folders (PR 12)
const { folder: _sceneFolder, ...SCENE_LIST_BASE } = SCENE_LIST;

/** The user's top 500 as a scene list: Grid, Wall and Table, sorted by rank */
const RECOMMENDED_LIST: ListPageConfig = {
  ...SCENE_LIST_BASE,
  title: "Recommended",
  subtitle: `Your top ${RECOMMENDED_LIMIT} scenes, from your favorites, ratings and viewing`,
  headerAside: (
    <Tooltip content={<RecommendationInfoContent />} position="bottom">
      <button
        className="p-1 mt-1 rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label="How recommendations work"
      >
        <Info size={18} style={{ color: "var(--text-muted)" }} />
      </button>
    </Tooltip>
  ),
  context: "scene_recommended",
  defaultSort: "recommended",
  viewModes: SCENE_LIST.viewModes.filter(
    (mode) => mode.id !== "timeline" && mode.id !== "folder"
  ),
  sortOptions: recommendedSortOptions,
  source: RECOMMENDED_SOURCE,
  emptyMessage: "No recommendations match these filters",
  usePage: useRecommendedListPage,
};

const Recommended = () => <EntityListPage config={RECOMMENDED_LIST} />;

export default Recommended;
