import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SceneCarousel from "../ui/SceneCarousel.jsx";
import ContinueWatchingCarousel from "../ui/ContinueWatchingCarousel.jsx";
import BulkActionBar from "../ui/BulkActionBar.jsx";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import { PageHeader, PageLayout } from "../ui/index.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useAsyncData } from "../../hooks/useApi.js";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries.js";
import { useAuth } from "../../hooks/useAuth.js";
import { CAROUSEL_DEFINITIONS, migrateCarouselPreferences } from "../../constants/carousels.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const SCENES_PER_CAROUSEL = 12;

const Home = () => {
  usePageTitle(); // Sets "Peek"
  const navigate = useNavigate();
  const carouselQueries = useHomeCarouselQueries(SCENES_PER_CAROUSEL);
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [_loadingPreferences, setLoadingPreferences] = useState(true);
  const [selectedScenes, setSelectedScenes] = useState([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMessage, setInitMessage] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await api.get("/user/settings");
        const prefs = migrateCarouselPreferences(
          response.data.settings.carouselPreferences
        );
        setCarouselPreferences(prefs);
      } catch {
        // Fallback to all enabled if fetch fails
        setCarouselPreferences(migrateCarouselPreferences([]));
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, []);

  const createSceneClickHandler = (scenes, carouselTitle) => (scene) => {
    const currentIndex = scenes.findIndex((s) => s.id === scene.id);

    navigate(`/video/${scene.id}`, {
      state: {
        scene,
        playlist: {
          id: "virtual-carousel",
          name: carouselTitle,
          shuffle: false,
          repeat: "none",
          scenes: scenes.map((s, idx) => ({
            sceneId: s.id,
            scene: s,
            position: idx,
          })),
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        },
      },
    });
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

  // Filter and sort carousels based on user preferences
  const activeCarousels = CAROUSEL_DEFINITIONS.map((def) => {
    const pref = carouselPreferences.find((p) => p.id === def.fetchKey);
    return { ...def, preference: pref };
  })
    .filter((def) => def.preference?.enabled !== false)
    .sort((a, b) => (a.preference?.order || 0) - (b.preference?.order || 0));

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
            backgroundColor: 'var(--status-info-bg)',
            borderLeftColor: 'var(--accent-info)',
            border: '1px solid var(--status-info-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <LoadingSpinner size="md" />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {initMessage || "Server is loading cache, please wait..."}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                This may take a minute on first startup. Checking every 5 seconds...
              </p>
            </div>
          </div>
        </div>
      )}

      {activeCarousels.map((def) => {
        const { title, iconComponent: IconComponent, iconProps, fetchKey, isSpecial } = def;
        const icon = IconComponent ? <IconComponent {...iconProps} /> : null;

        // Special handling for Continue Watching carousel
        if (isSpecial && fetchKey === "continueWatching") {
          return (
            <ContinueWatchingCarousel
              key={fetchKey}
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
              onInitializing={(initializing) => {
                if (initializing) {
                  setIsInitializing(true);
                  setInitMessage("Server is loading cache, please wait...");
                } else {
                  setIsInitializing(false);
                  setInitMessage(null);
                }
              }}
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
            onInitializing={(initializing) => {
              if (initializing) {
                setIsInitializing(true);
                setInitMessage("Server is loading cache, please wait...");
              } else {
                setIsInitializing(false);
                setInitMessage(null);
              }
            }}
          />
        );
      })}

      {/* Bulk Action Bar */}
      {selectedScenes.length > 0 && (
        <BulkActionBar
          selectedScenes={selectedScenes}
          onClearSelection={handleClearSelection}
        />
      )}
    </PageLayout>
  );
};

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
      if (retryCount < 60) { // Max 60 retries (5 minutes at 5s intervals)
        onInitializing(true);
        const timer = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          refetch();
        }, 5000); // Retry every 5 seconds
        return () => clearTimeout(timer);
      } else {
        onInitializing(false);
        console.error(`[${title}] Failed to load after ${retryCount} retries:`, error);
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
    />
  );
};

export default Home;
