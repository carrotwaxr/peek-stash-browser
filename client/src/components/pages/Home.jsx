import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import * as LucideIcons from "lucide-react";
import { LucideEyeOff, LucidePlus } from "lucide-react";
import {
  CAROUSEL_DEFINITIONS,
  migrateCarouselPreferences,
} from "../../constants/carousels.js";
import { useAsyncData } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useHideBulkAction } from "../../hooks/useHideBulkAction.js";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";
import { libraryApi } from "../../services/api.js";
import {
  carouselRulesToFilterState,
  SCENE_FILTER_OPTIONS,
} from "../../utils/filterConfig.js";
import { buildSearchParams } from "../../utils/urlParams.js";
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
} from "../ui/index.js";

const axiosApi = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const SCENES_PER_CAROUSEL = 12;

/**
 * Check if an ID is a custom carousel (prefixed with "custom-")
 */
const isCustomCarousel = (id) => id && id.startsWith("custom-");

/**
 * Get the "See More" URL for a hardcoded carousel based on its fetchKey
 */
const getSeeMoreUrl = (fetchKey) => {
  const urlMap = {
    recentlyAddedScenes: "/scenes?sort=created_at&dir=DESC",
    highRatedScenes: "/scenes?sort=random&rating_min=80",
    favoritePerformerScenes: "/scenes?sort=random&performerFavorite=true",
    favoriteTagScenes: "/scenes?sort=random&tagFavorite=true",
    favoriteStudioScenes: "/scenes?sort=random&studioFavorite=true",
    continueWatching: "/watch-history",
  };
  return urlMap[fetchKey] || null;
};

/**
 * Build a "See More" URL for a custom carousel from its rules
 */
const buildCustomCarouselUrl = (rules, sort, direction) => {
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
    filters: filterState,
    filterOptions: SCENE_FILTER_OPTIONS,
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
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [customCarousels, setCustomCarousels] = useState([]);
  const [_loadingPreferences, setLoadingPreferences] = useState(true);
  const [selectedScenes, setSelectedScenes] = useState([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMessage, setInitMessage] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load user preferences
        const response = await axiosApi.get("/user/settings");
        const prefs = migrateCarouselPreferences(
          response.data.settings.carouselPreferences
        );
        setCarouselPreferences(prefs);

        // Load custom carousels
        try {
          const { carousels } = await libraryApi.getCarousels();
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

  const createSceneClickHandler = (scenes, carouselTitle) => (scene) => {
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

  const handleToggleSelect = (scene) => {
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
    selectedScenes,
    onComplete: handleClearSelection,
  });

  const handleInitializing = useCallback((initializing) => {
    if (initializing) {
      setIsInitializing(true);
      setInitMessage("Server is syncing library, please wait...");
    } else {
      setIsInitializing(false);
      setInitMessage(null);
    }
  }, []);

  // Build the list of active carousels (hardcoded + custom)
  const activeCarousels = carouselPreferences
    .filter((pref) => pref.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((pref) => {
      // Check if it's a custom carousel
      if (isCustomCarousel(pref.id)) {
        const carouselId = pref.id.replace("custom-", "");
        const customCarousel = customCarousels.find((c) => c.id === carouselId);
        if (customCarousel) {
          const IconComponent = LucideIcons[customCarousel.icon] || LucideIcons.Film;
          return {
            type: "custom",
            id: carouselId,
            prefId: pref.id,
            title: customCarousel.title,
            iconComponent: IconComponent,
            iconProps: { className: "w-6 h-6", style: { color: "var(--accent-primary)" } },
          };
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
        };
      }
      return null;
    })
    .filter(Boolean); // Remove nulls

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
              carouselId={id}
              carousel={customCarousels.find((c) => c.id === id)}
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
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
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
            fetchKey={fetchKey}
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
                  sceneIds={selectedScenes.map((s) => s.id)}
                  buttonText={
                    <span>
                      <span className="hidden sm:inline">
                        Add {selectedScenes.length} to Playlist
                      </span>
                      <span className="sm:hidden">Add to Playlist</span>
                    </span>
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
const HomeCarousel = ({
  title,
  icon,
  fetchKey,
  createSceneClickHandler,
  carouselQueries,
  selectedScenes,
  onToggleSelect,
  onInitializing,
}) => {
  const [retryCount, setRetryCount] = useState(0);
  const fetchFunction = carouselQueries[fetchKey];
  const {
    data: scenes,
    loading,
    error,
    refetch,
  } = useAsyncData(fetchFunction, [fetchKey]);

  // Handle server initialization state
  useEffect(() => {
    if (error?.isInitializing) {
      if (retryCount < 60) {
        // Max 60 retries (5 minutes at 5s intervals)
        onInitializing(true);
        const timer = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          refetch();
        }, 5000); // Retry every 5 seconds
        return () => clearTimeout(timer);
      } else {
        onInitializing(false);
        console.error(
          `[${title}] Failed to load after ${retryCount} retries:`,
          error
        );
      }
    } else if (!error) {
      onInitializing(false);
      setRetryCount(0); // Reset retry count on success
    }
  }, [error, refetch, retryCount, onInitializing, title]);

  // Silently skip failed carousels (non-initialization errors only)
  if (error && !error.isInitializing) {
    console.error(`Failed to load carousel "${title}":`, error);
    return null;
  }

  // During initialization, show loading skeletons
  // Keep component mounted to allow retry useEffect to continue running
  const isInitializing = error?.isInitializing;

  return (
    <SceneCarousel
      loading={loading || isInitializing}
      title={title}
      titleIcon={icon}
      scenes={scenes || []}
      onSceneClick={createSceneClickHandler(scenes || [], title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={getSeeMoreUrl(fetchKey)}
    />
  );
};

/**
 * CustomCarousel - Renders a user-defined custom carousel
 * Fetches scenes from /api/carousels/:id/execute
 */
const CustomCarousel = ({
  carouselId,
  carousel,
  title,
  icon,
  createSceneClickHandler,
  selectedScenes,
  onToggleSelect,
  onInitializing,
}) => {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchCarousel = useCallback(async () => {
    setLoading(true);
    try {
      const { scenes: fetchedScenes } = await libraryApi.executeCarousel(carouselId);
      setScenes(fetchedScenes || []);
      setError(null);
      onInitializing(false);
    } catch (err) {
      // Check if server is initializing
      if (err.response?.status === 503) {
        setError({ isInitializing: true, message: err.message });
      } else {
        setError(err);
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
      loading={loading || isInitializing}
      title={title}
      titleIcon={icon}
      scenes={scenes}
      onSceneClick={createSceneClickHandler(scenes, title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={
        carousel
          ? buildCustomCarouselUrl(carousel.rules, carousel.sort, carousel.direction)
          : null
      }
    />
  );
};

export default Home;
