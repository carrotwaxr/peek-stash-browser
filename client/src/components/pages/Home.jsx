import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Star,
  Clock,
  Film,
  Zap,
  Calendar,
  Heart,
  Tag,
  Video,
} from "lucide-react";
import SceneCarousel from "../ui/SceneCarousel.jsx";
import ContinueWatchingCarousel from "../ui/ContinueWatchingCarousel.jsx";
import BulkActionBar from "../ui/BulkActionBar.jsx";
import { PageHeader, PageLayout } from "../ui/index.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useAsyncData } from "../../hooks/useApi.js";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries.js";
import { useAuth } from "../../hooks/useAuth.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CAROUSEL_DEFINITIONS = [
  {
    title: "Continue Watching",
    icon: <PlayCircle className="w-6 h-6" color="#10b981" />,
    fetchKey: "continueWatching",
    isSpecial: true, // Not a standard query carousel
  },
  {
    title: "High Rated",
    icon: <Star className="w-6 h-6" style={{ color: "var(--icon-rating)" }} />,
    fetchKey: "highRatedScenes",
  },
  {
    title: "Recently Added",
    icon: <Clock className="w-6 h-6" style={{ color: "var(--accent-info)" }} />,
    fetchKey: "recentlyAddedScenes",
  },
  {
    title: "Feature Length",
    icon: (
      <Film className="w-6 h-6" style={{ color: "var(--accent-secondary)" }} />
    ),
    fetchKey: "longScenes",
  },
  {
    title: "High Bitrate",
    icon: (
      <Zap className="w-6 h-6" style={{ color: "var(--accent-success)" }} />
    ),
    fetchKey: "highBitrateScenes",
  },
  {
    title: "Barely Legal",
    icon: (
      <Calendar
        className="w-6 h-6"
        style={{ color: "var(--accent-warning)" }}
      />
    ),
    fetchKey: "barelyLegalScenes",
  },
  {
    title: "Favorite Performers",
    icon: (
      <Heart className="w-6 h-6" style={{ color: "var(--accent-error)" }} />
    ),
    fetchKey: "favoritePerformerScenes",
  },
  {
    title: "Favorite Studios",
    icon: <Video className="w-6 h-6" style={{ color: "var(--accent-info)" }} />,
    fetchKey: "favoriteStudioScenes",
  },
  {
    title: "Favorite Tags",
    icon: (
      <Tag className="w-6 h-6" style={{ color: "var(--accent-primary)" }} />
    ),
    fetchKey: "favoriteTagScenes",
  },
];

const SCENES_PER_CAROUSEL = 12;

const Home = () => {
  usePageTitle(); // Sets "Peek"
  const navigate = useNavigate();
  const carouselQueries = useHomeCarouselQueries(SCENES_PER_CAROUSEL);
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [_loadingPreferences, setLoadingPreferences] = useState(true);
  const [selectedScenes, setSelectedScenes] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await api.get("/user/settings");
        let prefs = response.data.settings.carouselPreferences;

        // If no preferences exist, create defaults
        if (!prefs) {
          prefs = CAROUSEL_DEFINITIONS.map((def, idx) => ({
            id: def.fetchKey,
            enabled: true,
            order: idx,
          }));
        } else {
          // Migrate: Add any new carousels that don't exist in saved preferences
          const existingIds = new Set(prefs.map((p) => p.id));
          const missingCarousels = CAROUSEL_DEFINITIONS.filter(
            (def) => !existingIds.has(def.fetchKey)
          );

          // Add missing carousels at the end (or at beginning for continueWatching)
          missingCarousels.forEach((def) => {
            const newPref = {
              id: def.fetchKey,
              enabled: true,
              order: def.fetchKey === "continueWatching" ? -1 : prefs.length,
            };
            prefs.push(newPref);
          });

          // Re-normalize order values
          prefs.sort((a, b) => a.order - b.order);
          prefs = prefs.map((pref, idx) => ({ ...pref, order: idx }));
        }

        setCarouselPreferences(prefs);
      } catch {
        // Fallback to all enabled if fetch fails
        setCarouselPreferences(
          CAROUSEL_DEFINITIONS.map((def, idx) => ({
            id: def.fetchKey,
            enabled: true,
            order: idx,
          }))
        );
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

      {activeCarousels.map((def) => {
        const { title, icon, fetchKey, isSpecial } = def;

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
            fetchKey={fetchKey}
            createSceneClickHandler={createSceneClickHandler}
            carouselQueries={carouselQueries}
            selectedScenes={selectedScenes}
            onToggleSelect={handleToggleSelect}
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
}) => {
  const fetchFunction = carouselQueries[fetchKey];
  const {
    data: scenes,
    loading,
    error,
  } = useAsyncData(fetchFunction, [fetchKey]);

  if (error) {
    console.error(`Failed to load carousel "${title}":`, error);
    return null; // Silently skip failed carousels
  }

  return (
    <SceneCarousel
      loading={loading}
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
