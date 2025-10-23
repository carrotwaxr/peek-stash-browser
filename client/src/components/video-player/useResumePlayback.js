import { useEffect, useRef } from "react";

/**
 * useResumePlayback
 *
 * Manages resume playback time capture and autoplay flag.
 * Captures resume time from watch history and sets shouldAutoplay=true when resuming (Stash's pattern).
 */
export function useResumePlayback({
  scene,
  watchHistory,
  loadingWatchHistory,
  location,
  hasResumedRef,
  initialResumeTimeRef,
  setShouldAutoplay,
}) {
  // Reset resume state when scene changes
  useEffect(() => {
    hasResumedRef.current = false;
    initialResumeTimeRef.current = null;
  }, [scene?.id, hasResumedRef, initialResumeTimeRef]);

  // Capture resume time and set autoplay flag when watch history loads
  useEffect(() => {
    const shouldResume = location.state?.shouldResume;

    if (shouldResume && initialResumeTimeRef.current === null && !loadingWatchHistory && watchHistory?.resumeTime > 0) {
      initialResumeTimeRef.current = watchHistory.resumeTime;
      setShouldAutoplay(true);
    }
  }, [loadingWatchHistory, watchHistory, location.state, initialResumeTimeRef, setShouldAutoplay]);
}
