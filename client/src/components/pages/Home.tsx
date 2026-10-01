import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CarouselData, NormalizedScene } from "@peek/shared-types";
import { useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { LucideEyeOff, LucidePlus } from "lucide-react";
import { libraryApi } from "../../api";
import { useCarousels } from "../../api/hooks/useCarousels";
import {
  isLibraryInitializing,
  useLibraryReady,
} from "../../api/hooks/useLibraryReady";
import { useUserSettings } from "../../api/hooks/useUserSettings";
import { queryKeys } from "../../api/queryKeys";
import {
  CAROUSEL_DEFINITIONS,
  migrateCarouselPreferences,
} from "../../constants/carousels";
import { useConfig } from "../../contexts/ConfigContext";
import { useAuth } from "../../hooks/useAuth";
import { useHideBulkAction } from "../../hooks/useHideBulkAction";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries";
import { usePageTitle } from "../../hooks/usePageTitle";
import { getEntityPath } from "../../utils/entityLinks";
import {
  type FilterOption,
  SCENE_FILTER_OPTIONS,
  carouselRulesToFilterState,
} from "../../utils/filterConfig";
import { buildPlaybackQueue } from "../../utils/playbackQueue";
import { buildSearchParams } from "../../utils/urlParams";
import {
  AddToPlaylistButton,
  BulkActionBar,
  Button,
  ContinueWatchingCarousel,
  HideConfirmationDialog,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SceneCarousel,
} from "../ui/index";

interface CarouselDef {
  type: string;
  id?: string;
  prefId: string;
  title: string;
  iconComponent: React.ElementType;
  iconProps: Record<string, any>;
  fetchKey?: string;
  isSpecial?: boolean;
}

const SCENES_PER_CAROUSEL = 12;

/** Two servers can hold the same scene id: a scene is its id on its server */
const isSameScene = (a: NormalizedScene, b: NormalizedScene) =>
  a.id === b.id && a.instanceId === b.instanceId;

/**
 * Check if an ID is a custom carousel (prefixed with "custom-")
 */
const isCustomCarousel = (id: string) => id && id.startsWith("custom-");

/**
 * Get the "See More" URL for a hardcoded carousel based on its fetchKey
 */
const getSeeMoreUrl = (fetchKey: string): string | null => {
  const urlMap = {
    recentlyAddedScenes: "/scenes?sort=created_at&dir=DESC",
    highRatedScenes: "/scenes?sort=random&rating_min=80",
    favoritePerformerScenes: "/scenes?sort=random&performerFavorite=true",
    favoriteTagScenes: "/scenes?sort=random&tagFavorite=true",
    favoriteStudioScenes: "/scenes?sort=random&studioFavorite=true",
    continueWatching: "/watch-history",
  };
  return urlMap[fetchKey as keyof typeof urlMap] || null;
};

/**
 * Build a "See More" URL for a custom carousel from its rules
 */
const buildCustomCarouselUrl = (
  rules: Record<string, unknown> | null | undefined,
  sort: string | undefined,
  direction: string | undefined
): string => {
  if (!rules || typeof rules !== "object") {
    return "/scenes";
  }

  // Convert API rules format to UI filter state
  const filterState = carouselRulesToFilterState(rules);

  // Build URL params using existing utility
  const params = buildSearchParams({
    searchText: "",
    sortField: sort || "random",
    sortDirection: direction || "DESC",
    currentPage: 1,
    perPage: 24,
    filters: filterState as Record<string, unknown>,
    filterOptions: SCENE_FILTER_OPTIONS as FilterOption[],
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    timelinePeriod: null,
  });

  const queryString = params.toString();
  return queryString ? `/scenes?${queryString}` : "/scenes";
};

const Home = () => {
  usePageTitle("Home");
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const carouselQueries = useHomeCarouselQueries(SCENES_PER_CAROUSEL);
  // The custom carousels: one query, shared with Settings; a save or a
  // delete there marks it stale. A failed load shows no custom carousel.
  const { data: customCarouselList } = useCarousels();
  const customCarousels = useMemo<CarouselData[]>(
    () => customCarouselList ?? [],
    [customCarouselList]
  );
  const [selectedScenes, setSelectedScenes] = useState<NormalizedScene[]>([]);
  const { user } = useAuth();

  // The carousel order comes from the settings query, shared with every
  // other reader: coming back to Home sends no request. Before it answers
  // no carousel shows; after a failed load every carousel does.
  const { data: userSettings, isError: settingsFailed } = useUserSettings();
  const carouselPreferences = useMemo(() => {
    if (userSettings) {
      return migrateCarouselPreferences(
        userSettings.settings.carouselPreferences
      );
    }
    return settingsFailed ? migrateCarouselPreferences([]) : [];
  }, [userSettings, settingsFailed]);

  const createSceneClickHandler =
    (scenes: NormalizedScene[], carouselTitle: string) =>
    (scene: NormalizedScene) => {
      const currentIndex = scenes.findIndex((s) => isSameScene(s, scene));

      void navigate(getEntityPath("scene", scene, hasMultipleInstances), {
        state: {
          fromPageTitle: "Home",
          playlist: buildPlaybackQueue({
            userId: user?.id,
            id: "virtual-carousel",
            name: carouselTitle,
            scenes,
            currentIndex: currentIndex >= 0 ? currentIndex : 0,
          }),
        },
      });
      return true; // Prevent fallback navigation in SceneCard
    };

  const handleToggleSelect = (scene: NormalizedScene) => {
    setSelectedScenes((prev) => {
      const isSelected = prev.some((s) => isSameScene(s, scene));
      if (isSelected) {
        return prev.filter((s) => !isSameScene(s, scene));
      } else {
        return [...prev, scene];
      }
    });
  };

  const handleClearSelection = () => {
    setSelectedScenes([]);
  };

  // Bulk hide action
  const {
    hideDialogOpen,
    isHiding,
    handleHideClick,
    handleHideConfirm,
    closeHideDialog,
  } = useHideBulkAction({
    selectedScenes,
    onComplete: handleClearSelection,
  });

  // Build the list of active carousels (hardcoded + custom)
  const activeCarousels: CarouselDef[] = carouselPreferences
    .filter((pref) => pref.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((pref) => {
      // Check if it's a custom carousel
      if (isCustomCarousel(pref.id)) {
        const carouselId = pref.id.replace("custom-", "");
        const customCarousel = customCarousels.find((c) => c.id === carouselId);
        if (customCarousel) {
          const IconComponent =
            (LucideIcons as Record<string, any>)[customCarousel.icon] ||
            LucideIcons.Film;
          return {
            type: "custom",
            id: carouselId,
            prefId: pref.id,
            title: customCarousel.title,
            iconComponent: IconComponent,
            iconProps: {
              className: "w-6 h-6",
              style: { color: "var(--accent-primary)" },
            },
          } as CarouselDef;
        }
        return null; // Custom carousel not found
      }

      // Hardcoded carousel
      const def = CAROUSEL_DEFINITIONS.find((d) => d.fetchKey === pref.id);
      if (def) {
        return {
          type: "hardcoded",
          ...def,
          prefId: pref.id,
        } as CarouselDef;
      }
      return null;
    })
    .filter((c): c is CarouselDef => c !== null); // Remove nulls

  return (
    <PageLayout className="max-w-none">
      <PageHeader
        title={`Welcome, ${user?.username || "Home"}`}
        subtitle="Discover your favorite content and explore new scenes"
      />

      <LibraryInitializingBanner />

      {activeCarousels.map((carousel) => {
        // Render custom carousel
        if (carousel.type === "custom") {
          const {
            id,
            title,
            iconComponent: IconComponent,
            iconProps,
          } = carousel;
          const icon = IconComponent ? <IconComponent {...iconProps} /> : null;

          return (
            <CustomCarousel
              key={carousel.prefId}
              carouselId={id!}
              carousel={customCarousels.find((c) => c.id === id)}
              title={title}
              icon={icon}
              createSceneClickHandler={createSceneClickHandler}
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
            />
          );
        }

        // Render hardcoded carousel
        const {
          title,
          iconComponent: IconComponent,
          iconProps,
          fetchKey,
          isSpecial,
        } = carousel;
        const icon = IconComponent ? <IconComponent {...iconProps} /> : null;

        // Special handling for Continue Watching carousel
        if (isSpecial && fetchKey === "continueWatching") {
          return (
            <ContinueWatchingCarousel
              key={fetchKey}
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
            />
          );
        }

        // Standard query-based carousel
        return (
          <HomeCarousel
            key={fetchKey}
            title={title}
            icon={icon}
            fetchKey={fetchKey!}
            createSceneClickHandler={createSceneClickHandler}
            carouselQueries={carouselQueries}
            selectedScenes={selectedScenes}
            onToggleSelect={handleToggleSelect}
          />
        );
      })}

      {/* Bulk Action Bar */}
      {selectedScenes.length > 0 && (
        <>
          <BulkActionBar
            selectedScenes={selectedScenes}
            onClearSelection={handleClearSelection}
            actions={
              <>
                <Button
                  onClick={handleHideClick}
                  variant="secondary"
                  size="sm"
                  disabled={isHiding}
                  className="flex items-center gap-1.5"
                >
                  <LucideEyeOff className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {isHiding ? "Hiding..." : "Hide"}
                  </span>
                </Button>
                <AddToPlaylistButton
                  scenes={selectedScenes}
                  buttonText={
                    (
                      <span>
                        <span className="hidden sm:inline">
                          Add {selectedScenes.length} to Playlist
                        </span>
                        <span className="sm:hidden">Add to Playlist</span>
                      </span>
                    ) as unknown as string
                  }
                  icon={<LucidePlus className="w-4 h-4" />}
                  dropdownPosition="above"
                  onSuccess={handleClearSelection}
                />
              </>
            }
          />
          <HideConfirmationDialog
            isOpen={hideDialogOpen}
            onClose={closeHideDialog}
            onConfirm={(dontAskAgain) => void handleHideConfirm(dontAskAgain)}
            entityType="scene"
            entityName={`${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""}`}
          />
        </>
      )}
    </PageLayout>
  );
};

/**
 * HomeCarousel - Renders a hardcoded carousel using useHomeCarouselQueries.
 * While the library is initializing it shows its loading state and asks
 * nothing; it loads once useLibraryReady finds the library ready.
 */
interface HomeCarouselProps {
  title: string;
  icon: React.ReactNode;
  fetchKey: string;
  createSceneClickHandler: (
    scenes: NormalizedScene[],
    title: string
  ) => (scene: NormalizedScene) => boolean;
  carouselQueries: Record<string, () => Promise<unknown>>;
  selectedScenes: NormalizedScene[];
  onToggleSelect: (scene: NormalizedScene) => void;
}

const HomeCarousel = ({
  title,
  icon,
  fetchKey,
  createSceneClickHandler,
  carouselQueries,
  selectedScenes,
  onToggleSelect,
}: HomeCarouselProps) => {
  const { ready } = useLibraryReady();
  const fetchFunction = carouselQueries[fetchKey];
  const {
    data: scenes,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.homeCarousels.byKey(fetchKey),
    queryFn: () => {
      if (!fetchFunction) throw new Error(`Unknown carousel: ${fetchKey}`);
      return fetchFunction();
    },
    enabled: ready,
  });
  const initializing = !ready || isLibraryInitializing(error);
  // The carousel queries answer the scenes list's scenes
  const carouselScenes = (scenes ?? []) as NormalizedScene[];

  // Silently skip failed carousels (non-initialization errors only)
  if (error && !initializing) {
    console.error(`Failed to load carousel "${title}":`, error);
    return null;
  }

  return (
    <SceneCarousel
      loading={isLoading || initializing}
      title={title}
      titleIcon={icon}
      scenes={carouselScenes}
      onSceneClick={createSceneClickHandler(carouselScenes, title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={getSeeMoreUrl(fetchKey) || undefined}
    />
  );
};

/**
 * CustomCarousel - Renders a user-defined custom carousel
 * Fetches scenes from /api/carousels/:id/execute once the library is ready
 */
interface CustomCarouselProps {
  carouselId: string;
  carousel: CarouselData | undefined;
  title: string;
  icon: React.ReactNode;
  createSceneClickHandler: (
    scenes: NormalizedScene[],
    title: string
  ) => (scene: NormalizedScene) => boolean;
  selectedScenes: NormalizedScene[];
  onToggleSelect: (scene: NormalizedScene) => void;
}

const CustomCarousel = ({
  carouselId,
  carousel,
  title,
  icon,
  createSceneClickHandler,
  selectedScenes,
  onToggleSelect,
}: CustomCarouselProps) => {
  const { ready } = useLibraryReady();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.carousels.execute(carouselId),
    queryFn: ({ signal }) =>
      libraryApi.executeCarousel(carouselId, signal) as Promise<{
        scenes?: NormalizedScene[];
      }>,
    enabled: ready,
    // Its rules can change in Settings: ask again on every visit
    staleTime: 0,
  });
  const scenes = data?.scenes ?? [];
  const initializing = !ready || isLibraryInitializing(error);

  // Silently skip failed carousels (non-initialization errors only)
  if (error && !initializing) {
    console.error(`Failed to load custom carousel "${title}":`, error);
    return null;
  }

  // Don't render if no scenes and not loading/initializing
  if (!isLoading && !initializing && scenes.length === 0) {
    return null;
  }

  return (
    <SceneCarousel
      loading={isLoading || initializing}
      title={title}
      titleIcon={icon}
      scenes={scenes}
      onSceneClick={createSceneClickHandler(scenes, title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={
        carousel
          ? buildCustomCarouselUrl(
              carousel.rules,
              carousel.sort,
              carousel.direction
            )
          : undefined
      }
    />
  );
};

export default Home;
