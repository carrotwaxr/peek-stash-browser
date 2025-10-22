import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import SceneCarousel from './SceneCarousel.jsx';
import { useAllWatchHistory } from '../../hooks/useWatchHistory.js';
import { libraryApi } from '../../services/api.js';

/**
 * Continue Watching carousel component
 * Shows scenes that have been partially watched with resume times
 */
const ContinueWatchingCarousel = ({ selectedScenes = [], onToggleSelect }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: watchHistoryList, loading: loadingHistory, error } = useAllWatchHistory({
    inProgress: true,
    limit: 12
  });

  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch full scene data for each watch history entry
  useEffect(() => {
    const fetchScenes = async () => {
      if (!watchHistoryList || watchHistoryList.length === 0) {
        setScenes([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Extract scene IDs from watch history
        const sceneIds = watchHistoryList.map(wh => wh.sceneId);

        // Fetch scenes in bulk
        const response = await libraryApi.findScenes({ ids: sceneIds });
        const fetchedScenes = response?.findScenes?.scenes || [];

        // Match scenes with watch history data and add progress info
        const scenesWithProgress = fetchedScenes.map(scene => {
          const watchHistory = watchHistoryList.find(wh => wh.sceneId === scene.id);
          return {
            ...scene,
            watchHistory: watchHistory || null,
            resumeTime: watchHistory?.resumeTime || 0,
            playCount: watchHistory?.playCount || 0,
            lastPlayedAt: watchHistory?.lastPlayedAt || null,
          };
        });

        // Sort by lastPlayedAt (most recent first)
        scenesWithProgress.sort((a, b) => {
          const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
          const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
          return dateB - dateA;
        });

        setScenes(scenesWithProgress);
      } catch (err) {
        console.error('Error fetching continue watching scenes:', err);
        setScenes([]);
      } finally {
        setLoading(false);
      }
    };

    if (!loadingHistory) {
      fetchScenes();
    }
  }, [watchHistoryList, loadingHistory]);

  const handleSceneClick = (scene) => {
    const currentIndex = scenes.findIndex(s => s.id === scene.id);

    // Capture current URL with search params for Back button
    const referrerUrl = `${location.pathname}${location.search}`;

    navigate(`/video/${scene.id}`, {
      state: {
        scene,
        referrerUrl, // Store current URL to preserve filters when going back
        shouldResume: true, // Auto-resume from continue watching
        playlist: {
          id: "virtual-carousel",
          name: "Continue Watching",
          shuffle: false,
          repeat: "none",
          scenes: scenes.map((s, idx) => ({
            sceneId: s.id,
            scene: s,
            position: idx
          })),
          currentIndex: currentIndex >= 0 ? currentIndex : 0
        }
      }
    });
  };

  // Don't show carousel if no scenes in progress or error occurred
  if (error || (!loading && scenes.length === 0)) {
    return null;
  }

  return (
    <SceneCarousel
      loading={loading}
      title="Continue Watching"
      titleIcon={<PlayCircle className="w-6 h-6" color="#10b981" />}
      scenes={scenes}
      onSceneClick={handleSceneClick}
      showProgress={true}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
    />
  );
};

export default ContinueWatchingCarousel;
