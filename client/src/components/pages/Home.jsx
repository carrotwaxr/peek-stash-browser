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
  Building2,
  Tag,
} from "lucide-react";
import SceneCarousel from "../ui/SceneCarousel.jsx";
import { PageHeader } from "../ui/index.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useAsyncData } from "../../hooks/useApi.js";
import { useHomeCarouselQueries } from "../../hooks/useHomeCarouselQueries.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CAROUSEL_DEFINITIONS = [
  { title: "High Rated", icon: <Star className="w-6 h-6" color="#fbbf24" />, fetchKey: "highRatedScenes" },
  { title: "Recently Added", icon: <Clock className="w-6 h-6" color="#60a5fa" />, fetchKey: "recentlyAddedScenes" },
  { title: "Feature Length", icon: <Film className="w-6 h-6" color="#a78bfa" />, fetchKey: "longScenes" },
  { title: "High Bitrate", icon: <Zap className="w-6 h-6" color="#34d399" />, fetchKey: "highBitrateScenes" },
  { title: "Barely Legal", icon: <Calendar className="w-6 h-6" color="#fb923c" />, fetchKey: "barelyLegalScenes" },
  { title: "Favorite Performers", icon: <Heart className="w-6 h-6" color="#f87171" />, fetchKey: "favoritePerformerScenes" },
  { title: "Favorite Studios", icon: <Building2 className="w-6 h-6" color="#94a3b8" />, fetchKey: "favoriteStudioScenes" },
  { title: "Favorite Tags", icon: <Tag className="w-6 h-6" color="#c084fc" />, fetchKey: "favoriteTagScenes" },
];

const SCENES_PER_CAROUSEL = 12;

const Home = () => {
  usePageTitle(); // Sets "Peek"
  const navigate = useNavigate();
  const carouselQueries = useHomeCarouselQueries(SCENES_PER_CAROUSEL);
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await api.get("/user/settings");
        const prefs = response.data.settings.carouselPreferences ||
          CAROUSEL_DEFINITIONS.map((def, idx) => ({ id: def.fetchKey, enabled: true, order: idx }));
        setCarouselPreferences(prefs);
      } catch {
        // Fallback to all enabled if fetch fails
        setCarouselPreferences(
          CAROUSEL_DEFINITIONS.map((def, idx) => ({ id: def.fetchKey, enabled: true, order: idx }))
        );
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, []);

  const handleSceneClick = (scene) => {
    navigate(`/video/${scene.id}`, { state: { scene } });
  };

  // Filter and sort carousels based on user preferences
  const activeCarousels = CAROUSEL_DEFINITIONS
    .map((def) => {
      const pref = carouselPreferences.find((p) => p.id === def.fetchKey);
      return { ...def, preference: pref };
    })
    .filter((def) => def.preference?.enabled !== false)
    .sort((a, b) => (a.preference?.order || 0) - (b.preference?.order || 0));

  return (
    <div className="w-full py-8 px-4 lg:px-6 xl:px-8 max-w-none">
      <PageHeader
        title="Welcome Home"
        subtitle="Discover your favorite content and explore new scenes"
      />

      {activeCarousels.map(({ title, icon, fetchKey }) => (
        <HomeCarousel
          key={fetchKey}
          title={title}
          icon={icon}
          fetchKey={fetchKey}
          onSceneClick={handleSceneClick}
          carouselQueries={carouselQueries}
        />
      ))}
    </div>
  );
};

const HomeCarousel = ({ title, icon, fetchKey, onSceneClick, carouselQueries }) => {
  const fetchFunction = carouselQueries[fetchKey];
  const { data: scenes, loading, error } = useAsyncData(fetchFunction, [fetchKey]);

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
      onSceneClick={onSceneClick}
    />
  );
};

export default Home;
