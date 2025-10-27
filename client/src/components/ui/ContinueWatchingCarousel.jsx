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
const ContinueWatchingCarousel = ({ selectedScenes = [], onToggleSelect, onInitializing }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: watchHistoryList, loading: loadingHistory, error, refetch } = useAllWatchHistory({
    inProgress: true,
    limit: 12
  });

  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [scenesFetchError, setScenesFetchError] = useState(null);

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
        console.log('[Continue Watching] Fetching scenes...');

        // Extract scene IDs from watch history
        const sceneIds = watchHistoryList.map(wh => wh.sceneId);

        // Fetch scenes in bulk
        const response = await libraryApi.findScenes({ ids: sceneIds });
        const fetchedScenes = response?.findScenes?.scenes || [];
        console.log('[Continue Watching] Fetched', fetchedScenes.length, 'scenes');

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

        // Filter: Only show scenes where user has watched at least 2% of the video
        // This prevents accidental clicks from cluttering Continue Watching
        const MIN_WATCH_PERCENT = 2;
        const filteredScenes = scenesWithProgress.filter(scene => {
          const duration = scene.files?.[0]?.duration;
          const playDuration = scene.watchHistory?.playDuration;

          if (!duration || !playDuration) {
            return false; // No duration data, exclude
          }

          const percentWatched = (playDuration / duration) * 100;
          return percentWatched >= MIN_WATCH_PERCENT;
        });

        // Sort by lastPlayedAt (most recent first)
        filteredScenes.sort((a, b) => {
          const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0);
          const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0);
          return dateB - dateA;
        });

        setScenes(filteredScenes);
        setScenesFetchError(null);
      } catch (err) {
        console.error('Error fetching continue watching scenes:', err);
        setScenesFetchError(err);
        setScenes([]);
      } finally {
        setLoading(false);
      }
    };

    if (!loadingHistory) {
      fetchScenes();
    }
  }, [watchHistoryList, loadingHistory, retryTrigger]);

  // Handle server initialization state
  useEffect(() => {
    const isWatchHistoryInitializing = error?.isInitializing;
    const isScenesInitializing = scenesFetchError?.isInitializing;
    const isInitializing = isWatchHistoryInitializing || isScenesInitializing;

    if (isInitializing && retryCount < 60 && onInitializing) {
      onInitializing(true);
      console.log(`[Continue Watching] Server initializing, retry ${retryCount + 1}/60 in 5 seconds...`);
      const timer = setTimeout(() => {
        console.log(`[Continue Watching] Retrying both watch history and scenes fetch...`);
        setRetryCount(prev => prev + 1);
        refetch(); // Retry watch history fetch
        setRetryTrigger(prev => prev + 1); // Trigger scenes refetch
      }, 5000);
      return () => {
        console.log(`[Continue Watching] Clearing timeout`);
        clearTimeout(timer);
      };
    } else if (isInitializing && retryCount >= 60 && onInitializing) {
      onInitializing(false);
      console.error(`[Continue Watching] Failed to load after ${retryCount} retries`);
    } else if (!isInitializing && onInitializing) {
      onInitializing(false);
      setRetryCount(0);
      console.log(`[Continue Watching] Loaded successfully`);
    }
  }, [error, scenesFetchError, refetch, retryCount, onInitializing]);

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

  // Don't show carousel if error (non-initialization) or no scenes
  const isInitializing = error?.isInitializing || scenesFetchError?.isInitializing;
  if ((error && !error.isInitializing) || (scenesFetchError && !scenesFetchError.isInitializing)) {
    console.error('Continue Watching error (non-initialization):', error || scenesFetchError);
    return null;
  }
  if (!loading && !isInitializing && scenes.length === 0) {
    return null;
  }

  return (
    <SceneCarousel
      loading={loading || isInitializing}
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
