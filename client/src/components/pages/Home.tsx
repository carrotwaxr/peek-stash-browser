import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as LucideIcons from "lucide-react";
import { LucideEyeOff, LucidePlus } from "lucide-react";
import {
  CAROUSEL_DEFINITIONS,
  migrateCarouselPreferences,
} from "../../constants/carousels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { useHideBulkAction } from "../../hooks/useHideBulkAction";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { apiGet, libraryApi } from "../../api";
import { ApiError } from "../../api/client";
import {
  carouselRulesToFilterState,
  SCENE_FILTER_OPTIONS,
} from "../../utils/filterConfig";
import { buildSearchParams } from "../../utils/urlParams";
import type { NormalizedScene } from "@peek/shared-types";

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
import {
  AddToPlaylistButton,
  BulkActionBar,
  Button,
  ContinueWatchingCarousel,
  HideConfirmationDialog,
  LoadingSpinner,
  PageHeader,
  PageLayout,
  SceneCarousel,
} from "../ui/index";

const SCENES_PER_CAROUSEL = 12;

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
const buildCustomCarouselUrl = (rules: Record<string, unknown> | null | undefined, sort: string | undefined, direction: string | undefined): string => {
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
    filterOptions: SCENE_FILTER_OPTIONS as any,
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
  const location = useLocation();
  const { hasMultipleInstances } = useConfig();
  const carouselQueries = useHomeCarouselQueries(SCENES_PER_CAROUSEL);
  const [carouselPreferences, setCarouselPreferences] = useState<any[]>([]);
  const [customCarousels, setCustomCarousels] = useState<Record<string, unknown>[]>([]);
  const [_loadingPreferences, setLoadingPreferences] = useState(true);
  const [selectedScenes, setSelectedScenes] = useState<Record<string, unknown>[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMessage, setInitMessage] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load user preferences
        const data = await apiGet("/user/settings") as Record<string, any>;
        const prefs = migrateCarouselPreferences(
          data.settings.carouselPreferences
        );
        setCarouselPreferences(prefs);

        // Load custom carousels
        try {
          const { carousels } = await libraryApi.getCarousels() as Record<string, any>;
          setCustomCarousels(carousels || []);
        } catch (err) {
          console.error("Failed to load custom carousels:", err);
        }
      } catch {
        // Fallback to all enabled if fetch fails
        setCarouselPreferences(migrateCarouselPreferences([]));
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadData();
    // Re-fetch when navigating to homepage (location.key changes on each navigation)
     
  }, [location.key]);

  const createSceneClickHandler = (scenes: Record<string, unknown>[], carouselTitle: string) => (scene: Record<string, unknown>) => {
    const currentIndex = scenes.findIndex((s) => s.id === scene.id);

    navigate(getEntityPath('scene', scene, hasMultipleInstances), {
      state: {
        scene,
        fromPageTitle: "Home",
        playlist: {
          id: "virtual-carousel",
          name: carouselTitle,
          shuffle: false,
          repeat: "none",
          scenes: scenes.map((s, idx) => ({
            sceneId: s.id,
            instanceId: s.instanceId,
            scene: s,
            position: idx,
          })),
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        },
      },
    });
    return true; // Prevent fallback navigation in SceneCard
  };

  const handleToggleSelect = (scene: Record<string, unknown>) => {
    setSelectedScenes((prev) => {
      const isSelected = prev.some((s) => s.id === scene.id);
      if (isSelected) {
        return prev.filter((s) => s.id !== scene.id);
      } else {
        return [...prev, scene];
      }
    });
  };

  const handleClearSelection = () => {
    setSelectedScenes([]);
  };

  // Bulk hide action
  const { hideDialogOpen, isHiding, handleHideClick, handleHideConfirm, closeHideDialog } = useHideBulkAction({
    selectedScenes: selectedScenes as { id: string | number }[],
    onComplete: handleClearSelection,
  });

  const handleInitializing = useCallback((initializing: boolean) => {
    if (initializing) {
      setIsInitializing(true);
      setInitMessage("Server is syncing library, please wait...");
    } else {
      setIsInitializing(false);
      setInitMessage(null);
    }
  }, []);

  // Build the list of active carousels (hardcoded + custom)
  const activeCarousels: CarouselDef[] = carouselPreferences
    .filter((pref) => pref.enabled !== false)
    .sort((a, b) => ((a.order as number) || 0) - ((b.order as number) || 0))
    .map((pref) => {
      // Check if it's a custom carousel
      if (isCustomCarousel(pref.id as string)) {
        const carouselId = (pref.id as string).replace("custom-", "");
        const customCarousel = customCarousels.find((c) => c.id === carouselId);
        if (customCarousel) {
          const IconComponent = (LucideIcons as Record<string, any>)[customCarousel.icon as string] || LucideIcons.Film;
          return {
            type: "custom",
            id: carouselId,
            prefId: pref.id as string,
            title: customCarousel.title as string,
            iconComponent: IconComponent,
            iconProps: { className: "w-6 h-6", style: { color: "var(--accent-primary)" } },
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
          prefId: pref.id as string,
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

      {/* Show initialization message at top */}
      {isInitializing && (
        <div
          className="mb-6 px-6 py-4 rounded-lg border-l-4"
          style={{
            backgroundColor: "var(--status-info-bg)",
            borderLeftColor: "var(--status-info)",
            border: "1px solid var(--status-info-border)",
          }}
        >
          <div className="flex items-center gap-3">
            <LoadingSpinner size="md" />
            <div>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {initMessage || "Server is syncing library, please wait..."}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                This may take a minute on first startup. Checking every 5
                seconds...
              </p>
            </div>
          </div>
        </div>
      )}

      {activeCarousels.map((carousel) => {
        // Render custom carousel
        if (carousel.type === "custom") {
          const { id, title, iconComponent: IconComponent, iconProps } = carousel;
          const icon = IconComponent ? <IconComponent {...iconProps} /> : null;

          return (
            <CustomCarousel
              key={carousel.prefId}
              carouselId={id!}
              carousel={customCarousels.find((c) => c.id === id) || ({} as Record<string, unknown>)}
              title={title}
              icon={icon}
              createSceneClickHandler={createSceneClickHandler}
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
              onInitializing={handleInitializing}
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
              selectedScenes={selectedScenes as unknown as NormalizedScene[]}
              onToggleSelect={handleToggleSelect as unknown as (scene: NormalizedScene) => void}
              onInitializing={handleInitializing}
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
            onInitializing={handleInitializing}
          />
        );
      })}

      {/* Bulk Action Bar */}
      {selectedScenes.length > 0 && (
        <>
          <BulkActionBar
            selectedScenes={selectedScenes as unknown as NormalizedScene[]}
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
                  sceneIds={selectedScenes.map((s) => String(s.id))}
                  buttonText={
                    (<span>
                      <span className="hidden sm:inline">
                        Add {selectedScenes.length} to Playlist
                      </span>
                      <span className="sm:hidden">Add to Playlist</span>
                    </span>) as unknown as string
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
            onConfirm={handleHideConfirm}
            entityType="scene"
            entityName={`${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""}`}
          />
        </>
      )}
    </PageLayout>
  );
};

/**
 * HomeCarousel - Renders a hardcoded carousel using useHomeCarouselQueries
 */
interface HomeCarouselProps {
  title: string;
  icon: React.ReactNode;
  fetchKey: string;
  createSceneClickHandler: (scenes: Record<string, unknown>[], title: string) => (scene: Record<string, unknown>) => void;
  carouselQueries: Record<string, () => Promise<unknown>>;
  selectedScenes: Record<string, unknown>[];
  onToggleSelect: (scene: Record<string, unknown>) => void;
  onInitializing: (value: boolean) => void;
}

const HomeCarousel = ({
  title,
  icon,
  fetchKey,
  createSceneClickHandler,
  carouselQueries,
  selectedScenes,
  onToggleSelect,
  onInitializing,
}: HomeCarouselProps) => {
  const [retryCount, setRetryCount] = useState(0);
  const queryClient = useQueryClient();
  const fetchFunction = carouselQueries[fetchKey];
  const queryKey = useMemo(() => ["homeCarousel", fetchKey] as const, [fetchKey]);
  const {
    data: scenes,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchFunction(),
  });
  const errorAny = error as (Error & { isInitializing?: boolean }) | null;
  // Handle server initialization state
  useEffect(() => {
    if (errorAny?.isInitializing) {
      if (retryCount < 60) {
        // Max 60 retries (5 minutes at 5s intervals)
        onInitializing(true);
        const timer = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          queryClient.invalidateQueries({ queryKey: [...queryKey] });
        }, 5000); // Retry every 5 seconds
        return () => clearTimeout(timer);
      } else {
        onInitializing(false);
        console.error(
          `[${title}] Failed to load after ${retryCount} retries:`,
          error
        );
      }
    } else if (!errorAny) {
      onInitializing(false);
      setRetryCount(0); // Reset retry count on success
    }
  }, [error, errorAny, queryClient, queryKey, retryCount, onInitializing, title]);

  // Silently skip failed carousels (non-initialization errors only)
  if (errorAny && !errorAny.isInitializing) {
    console.error(`Failed to load carousel "${title}":`, error);
    return null;
  }

  // During initialization, show loading skeletons
  // Keep component mounted to allow retry useEffect to continue running
  const isInitializing = errorAny?.isInitializing;

  return (
    <SceneCarousel
      loading={loading || !!isInitializing}
      title={title}
      titleIcon={icon}
      scenes={(scenes || []) as unknown as NormalizedScene[]}
      onSceneClick={createSceneClickHandler((scenes || []) as Record<string, unknown>[], title) as unknown as (scene: NormalizedScene) => boolean | void}
      selectedScenes={selectedScenes as unknown as NormalizedScene[]}
      onToggleSelect={onToggleSelect as unknown as (scene: NormalizedScene) => void}
      seeMoreUrl={getSeeMoreUrl(fetchKey) || undefined}
    />
  );
};

/**
 * CustomCarousel - Renders a user-defined custom carousel
 * Fetches scenes from /api/carousels/:id/execute
 */
interface CustomCarouselProps {
  carouselId: string;
  carousel: Record<string, unknown>;
  title: string;
  icon: React.ReactNode;
  createSceneClickHandler: (scenes: Record<string, unknown>[], title: string) => (scene: Record<string, unknown>) => void;
  selectedScenes: Record<string, unknown>[];
  onToggleSelect: (scene: Record<string, unknown>) => void;
  onInitializing: (value: boolean) => void;
}

const CustomCarousel = ({
  carouselId,
  carousel,
  title,
  icon,
  createSceneClickHandler,
  selectedScenes,
  onToggleSelect,
  onInitializing,
}: CustomCarouselProps) => {
  const [scenes, setScenes] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Record<string, unknown> | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchCarousel = useCallback(async () => {
    setLoading(true);
    try {
      const { scenes: fetchedScenes } = await libraryApi.executeCarousel(carouselId) as Record<string, any>;
      setScenes(fetchedScenes || []);
      setError(null);
      onInitializing(false);
    } catch (err) {
      // Check if server is initializing
      if (err instanceof ApiError && err.status === 503) {
        setError({ isInitializing: true, message: err.message });
      } else {
        setError(err as Record<string, unknown>);
        console.error(`Failed to load custom carousel "${title}":`, err);
      }
    } finally {
      setLoading(false);
    }
  }, [carouselId, onInitializing, title]);

  useEffect(() => {
    fetchCarousel();
  }, [fetchCarousel]);

  // Handle server initialization state with retry
  useEffect(() => {
    if (error?.isInitializing) {
      if (retryCount < 60) {
        onInitializing(true);
        const timer = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          fetchCarousel();
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        onInitializing(false);
        console.error(
          `[${title}] Failed to load after ${retryCount} retries:`,
          error
        );
      }
    } else if (!error) {
      setRetryCount(0);
    }
  }, [error, retryCount, onInitializing, title, fetchCarousel]);

  // Silently skip failed carousels (non-initialization errors only)
  if (error && !error.isInitializing) {
    return null;
  }

  // During initialization, show loading skeletons
  const isInitializing = error?.isInitializing;

  // Don't render if no scenes and not loading/initializing
  if (!loading && !isInitializing && scenes.length === 0) {
    return null;
  }

  return (
    <SceneCarousel
      loading={loading || !!isInitializing}
      title={title}
      titleIcon={icon}
      scenes={scenes as unknown as NormalizedScene[]}
      onSceneClick={createSceneClickHandler(scenes, title) as unknown as (scene: NormalizedScene) => boolean | void}
      selectedScenes={selectedScenes as unknown as NormalizedScene[]}
      onToggleSelect={onToggleSelect as unknown as (scene: NormalizedScene) => void}
      seeMoreUrl={
        carousel
          ? buildCustomCarouselUrl(carousel.rules as Record<string, unknown>, carousel.sort as string, carousel.direction as string)
          : undefined
      }
    />
  );
};

export default Home;
