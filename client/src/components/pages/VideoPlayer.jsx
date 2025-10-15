import { useRef, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./VideoPlayer.css";
import axios from "axios";
import { canDirectPlayVideo } from "../../utils/videoFormat.js";
import Navigation from "../ui/Navigation.jsx";

const api = axios.create({
  baseURL: "/api",
});

// Helper function to configure HLS for VOD (Video On Demand) behavior
const setupHLSforVOD = (player, scene) => {
  player.ready(() => {
    // Force the player to treat HLS as VOD, not live
    const tech = player.tech();
    if (tech && tech.vhs) {
      const vhs = tech.vhs;

      // Wait for playlists to be loaded
      vhs.playlists.on("loadedplaylist", () => {
        const media = vhs.playlists.media();
        if (media) {
          console.log("Configuring playlist for VOD:", media);

          // Force VOD characteristics
          media.endList = true; // Mark playlist as ended (VOD)
          media.live = false; // Not live
          media.dvr = false; // Not DVR

          // Remove any live-related metadata
          if (media.playlistType) {
            delete media.playlistType;
          }

          // Set duration from scene metadata if available
          const duration = scene?.files?.[0]?.duration;
          if (duration) {
            media.totalDuration = duration;
            media.targetDuration = Math.min(10, duration / 100); // Reasonable segment duration
          }
        }
      });

      // Override seekable range to enable full seeking
      const originalSeekable = tech.seekable;
      tech.seekable = function () {
        const seekableRange = originalSeekable.call(this);

        // If we have duration info, create a full seekable range
        const duration = scene?.files?.[0]?.duration;
        if (duration && seekableRange.length === 0) {
          console.log("Creating seekable range for VOD:", duration);
          return videojs.createTimeRanges([[0, duration]]);
        }

        // If we have a seekable range but it's restricted, expand it
        if (seekableRange.length > 0) {
          const start = Math.max(0, seekableRange.start(0));
          const end =
            scene?.files?.[0]?.duration ||
            seekableRange.end(seekableRange.length - 1);
          return videojs.createTimeRanges([[start, end]]);
        }

        return seekableRange;
      };

      // Force duration setting
      const duration = scene?.files?.[0]?.duration;
      if (duration) {
        player.duration(duration);
        console.log("Set player duration:", duration);
      }
    }
  });

  // Handle metadata loaded to set duration
  player.on("loadedmetadata", () => {
    const duration = scene?.files?.[0]?.duration;
    if (duration && player.duration() === Infinity) {
      player.duration(duration);
      console.log("Updated duration after metadata:", duration);
    }
  });

  // Handle duration changes
  player.on("durationchange", () => {
    console.log("Duration changed:", player.duration());
    const duration = scene?.files?.[0]?.duration;
    if (player.duration() === Infinity && duration) {
      player.duration(duration);
    }
  });
};

// Helper function to setup quality selector
const setupQualitySelector = (player) => {
  player.ready(() => {
    const qualityLevels = player.qualityLevels();

    // Create quality selector menu
    const createQualityMenu = () => {
      const qualities = ["Auto"];
      const qualityMap = new Map();

      // Collect available qualities
      for (let i = 0; i < qualityLevels.length; i++) {
        const quality = qualityLevels[i];
        const height = quality.height;
        const label = `${height}p`;

        if (!qualities.includes(label)) {
          qualities.push(label);
          qualityMap.set(label, i);
        }
      }

      // Add quality selector to control bar
      if (qualities.length > 1) {
        const qualityButton = document.createElement("div");
        qualityButton.className = "vjs-quality-selector vjs-control vjs-button";
        qualityButton.innerHTML = `
          <button class="vjs-quality-button" type="button" aria-live="polite" title="Quality">
            <span class="vjs-icon-chapters"></span>
            <span class="vjs-quality-text">Auto</span>
          </button>
          <div class="vjs-quality-menu" style="display: none;">
            ${qualities
              .map(
                (q) =>
                  `<div class="vjs-quality-item" data-quality="${q}">${q}</div>`
              )
              .join("")}
          </div>
        `;

        const controlBar = player.controlBar.el();
        const fullscreenToggle = controlBar.querySelector(
          ".vjs-fullscreen-control"
        );
        controlBar.insertBefore(qualityButton, fullscreenToggle);

        // Handle quality selection
        qualityButton.addEventListener("click", () => {
          const menu = qualityButton.querySelector(".vjs-quality-menu");
          menu.style.display = menu.style.display === "none" ? "block" : "none";
        });

        qualityButton.querySelectorAll(".vjs-quality-item").forEach((item) => {
          item.addEventListener("click", (e) => {
            const selectedQuality = e.target.dataset.quality;
            const button = qualityButton.querySelector(".vjs-quality-text");
            button.textContent = selectedQuality;

            if (selectedQuality === "Auto") {
              // Enable all qualities for auto selection
              for (let i = 0; i < qualityLevels.length; i++) {
                qualityLevels[i].enabled = true;
              }
            } else {
              // Disable all qualities except selected
              for (let i = 0; i < qualityLevels.length; i++) {
                qualityLevels[i].enabled = false;
              }
              const selectedIndex = qualityMap.get(selectedQuality);
              if (selectedIndex !== undefined) {
                qualityLevels[selectedIndex].enabled = true;
              }
            }

            qualityButton.querySelector(".vjs-quality-menu").style.display =
              "none";
          });
        });
      }
    };

    // Wait for quality levels to be populated
    qualityLevels.on("addqualitylevel", createQualityMenu);
  });
};

// Helper function to setup transcoded seeking
const setupTranscodedSeeking = (player, sessionId) => {
  let isTranscodedSeeking = false;
  let lastSeekTime = 0;
  const SEEK_THRESHOLD = 10; // Only restart transcoding if seeking more than 10 seconds

  player.on("seeking", () => {
    if (isTranscodedSeeking) return; // Prevent recursive calls

    const currentTime = player.currentTime();
    const duration = player.duration();
    const seekDistance = Math.abs(currentTime - lastSeekTime);

    console.log(
      `Seeking to: ${currentTime}s of ${duration}s (distance: ${seekDistance}s)`
    );

    // Only restart transcoding if seeking a significant distance
    if (seekDistance > SEEK_THRESHOLD) {
      isTranscodedSeeking = true;

      // Send seek request to backend to restart transcoding
      api
        .post("/video/seek", {
          sessionId: sessionId,
          startTime: currentTime,
        })
        .then((response) => {
          console.log("Seek request sent to backend", response.data);

          // Update the video source with new session
          if (response.data.sessionId && response.data.playlistUrl) {
            const newPlaylistUrl = response.data.playlistUrl;
            player.src({
              src: newPlaylistUrl,
              type: "application/x-mpegURL",
            });

            // Load the new source
            player.load();
          }

          isTranscodedSeeking = false;
          lastSeekTime = currentTime;
        })
        .catch((error) => {
          console.error("Error seeking:", error);
          isTranscodedSeeking = false;
        });
    }
  });

  // Handle when transcoding catches up to seek point
  player.on("loadedmetadata", () => {
    console.log("Metadata loaded, duration:", player.duration());
  });

  // Monitor buffering for transcoded content
  player.on("progress", () => {
    const buffered = player.buffered();
    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1);
      const currentTime = player.currentTime();
      const bufferAhead = bufferedEnd - currentTime;

      console.log(`Buffer: ${bufferAhead.toFixed(1)}s ahead`);

      // If buffer is running low, might need to adjust transcoding
      if (bufferAhead < 10 && !player.paused()) {
        console.log("Buffer running low, may need transcoding adjustment");
      }
    }
  });
};

const VideoPlayer = ({ scene }) => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [video, setVideo] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [transcodingStatus, setTranscodingStatus] = useState("loading");
  const [playbackMode, setPlaybackMode] = useState("auto"); // "auto", "direct", "transcode"
  const [showPoster, setShowPoster] = useState(true); // Show poster instead of autoplay
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [showDetails, setShowDetails] = useState(true); // Accordion for Details section
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false); // Accordion for Technical Details section

  // Use the first file for compatibility checking
  const firstFile = scene.files?.[0];
  const compatibility = firstFile ? canDirectPlayVideo(firstFile) : null;

  // Function to fetch video data when user clicks play
  const fetchVideoData = async () => {
    if (!scene.id || video || isLoadingAPI) return; // Also check if already loading

    const canDirectPlay = compatibility?.canDirectPlay || false;

    console.log(
      `Making API call for ${
        canDirectPlay ? "direct" : "transcoded"
      } session...`
    );
    setIsLoadingAPI(true);

    try {
      if (canDirectPlay) {
        // For direct play, we don't need to fetch JSON data
        // The API endpoint will serve the video file directly
        setVideo({ directPlay: true }); // Just a flag to trigger player init
        setShowPoster(false);
      } else {
        // For transcoded content, we need session info
        const response = await api.get(
          `/video/play?sceneId=${scene.id}&direct=false&userId=user1`
        );

        console.log("API response:", response.data);
        setVideo(response.data.scene);
        setSessionId(response.data.sessionId);
        setTranscodingStatus(response.data.status);
        console.log("Set sessionId:", response.data.sessionId);
        setShowPoster(false);
      }
    } catch (error) {
      console.error("Error fetching video:", error);
    } finally {
      setIsLoadingAPI(false);
      setIsInitializing(false);
    }
  };

  // Effect to restart player when mode changes
  useEffect(() => {
    if (playerRef.current) {
      // Clean up existing player when mode changes
      playerRef.current.dispose();
      playerRef.current = null;
    }
  }, [playbackMode]);

  useEffect(() => {
    if (!playerRef.current && video && !showPoster) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      // Determine playback method based on mode selection
      let canDirectPlay;
      if (playbackMode === "direct") {
        canDirectPlay = true;
      } else if (playbackMode === "transcode") {
        canDirectPlay = false;
      } else {
        // Auto mode - use compatibility detection
        canDirectPlay = compatibility?.canDirectPlay || false;
      }

      // For transcoded content, wait for sessionId to be set
      if (!canDirectPlay && !sessionId) {
        console.log(
          "Waiting for sessionId before initializing player... sessionId:",
          sessionId
        );
        return;
      }

      console.log(
        "Initializing player with sessionId:",
        sessionId,
        "canDirectPlay:",
        canDirectPlay,
        "video:",
        video
      );

      let sources;
      if (canDirectPlay) {
        // Direct play URL
        const apiUrl = `/api/video/play?sceneId=${scene.id}&direct=true`;
        sources = [
          {
            src: apiUrl,
            type: `video/${firstFile?.format}`,
            label: "Direct Play",
          },
        ];
      } else {
        // HLS transcoding URL
        const playlistUrl = `/api/video/playlist/${sessionId}/master.m3u8`;
        sources = [
          {
            src: playlistUrl,
            type: "application/x-mpegURL",
            label: "Adaptive Streaming",
          },
        ];
      }

      const videoJsOptions = {
        autoplay: true, // User clicked play, so start playing
        controls: true,
        responsive: true,
        fluid: true,
        sources: sources,
        playbackRates: [0.5, 1, 1.25, 1.5, 2], // Playback speed options
        html5: {
          vhs: {
            // VOD Configuration - Force Video On Demand behavior
            overrideNative: !videojs.browser.IS_SAFARI, // Use native HLS on Safari
            enableLowInitialPlaylist: false, // Don't treat as live stream
            smoothQualityChange: true, // Smooth quality transitions
            useBandwidthFromLocalStorage: true, // Remember bandwidth
            limitRenditionByPlayerDimensions: true, // Optimize for player size
            useDevicePixelRatio: true, // Use device pixel ratio for quality
            allowSeeksWithinUnsafeLiveWindow: true, // Allow seeking in live-like streams
            liveRangeSafeTimeDelta: 30, // Increase safe time delta
            playlistExclusionDuration: 300, // Keep playlists available longer
            handlePartialData: true, // Handle partial segments for seeking
            experimentalBufferBasedABR: false, // Use traditional ABR
          },
          nativeAudioTracks: false, // Handle audio tracks via Video.js
          nativeVideoTracks: false, // Handle video tracks via Video.js
        },
        // Enable quality selector plugin
        plugins: {
          qualityLevels: {},
        },
      };

      playerRef.current = videojs(videoElement, videoJsOptions, () => {
        console.log("player is ready");
        console.log("Video object:", video);

        const player = playerRef.current;

        // Clear initializing state and start playback
        setIsInitializing(false);

        // Start playback since user clicked the poster
        player.ready(() => {
          player.play().catch((err) => {
            console.warn("Autoplay failed, user interaction required:", err);
          });
        });

        // Configure HLS for VOD behavior if not direct play
        if (!canDirectPlay) {
          setupHLSforVOD(player, scene);
        }

        // Setup quality selector
        setupQualitySelector(player);

        // Setup seeking handlers for transcoded content
        if (!canDirectPlay && sessionId) {
          setupTranscodedSeeking(player, sessionId);
        }
      });
    }
  }, [
    scene,
    video,
    sessionId,
    firstFile?.format,
    compatibility?.canDirectPlay,
    playbackMode,
    showPoster,
  ]); // Include all dependencies

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // We can show the poster and scene details even without video data loaded
  // Only block rendering if we don't have the scene at all
  if (!scene) {
    return <div className="p-8">Loading scene...</div>;
  }

  const formatDuration = (seconds) => {
    if (!seconds) return "Unknown";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Full Navigation Header */}
      <Navigation />

      {/* Video Player Header */}
      <header
        className="container-fluid py-3"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="btn"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              padding: "8px 16px",
            }}
          >
            ← Back
          </button>
          {/* Scene Title */}
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {scene.title}
          </h1>
          <div></div> {/* Spacer for flex layout */}
        </div>
      </header>

      {/* Main content area */}
      <main className="container-fluid">
        {/* Video player section - full width */}
        <section className="py-6">
          <div className="video-container">
            {showPoster ? (
              /* Poster view with play button */
              <div
                className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer group ${
                  scene.paths?.screenshot ? "bg-black" : "video-poster"
                }`}
                onClick={() => {
                  setIsInitializing(true);
                  fetchVideoData();
                }}
                style={{
                  backgroundImage: scene.paths?.screenshot
                    ? `url(${scene.paths.screenshot})`
                    : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-20 transition-all duration-300"></div>

                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="poster-play-button w-20 h-20 bg-black bg-opacity-70 rounded-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                {/* Loading indicator if initializing or loading API */}
                {(isInitializing || isLoadingAPI) && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-3"></div>
                      <p>
                        {isLoadingAPI
                          ? "Connecting to server..."
                          : "Loading video..."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Video.js player */
              <div data-vjs-player>
                <video
                  ref={videoRef}
                  className="video-js vjs-big-play-centered"
                />
              </div>
            )}
          </div>
        </section>

        {/* Playback Controls */}
        <section className="container-fluid px-4 py-4">
          <div
            className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            {/* Playback Mode Selector */}
            <div className="flex items-center gap-2">
              <label
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Playback Mode:
              </label>
              <select
                value={playbackMode}
                onChange={(e) => setPlaybackMode(e.target.value)}
                className="btn text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  padding: "8px 12px",
                }}
              >
                <option value="auto">Auto</option>
                <option value="direct">Direct Play</option>
                <option value="transcode">Force Transcode</option>
              </select>
            </div>

            {/* Playback Status and Reset */}
            <div className="flex items-center gap-4">
              {/* Playback Status Indicator */}
              {compatibility && (
                <div className="flex items-center gap-2">
                  <span
                    className={`status-indicator ${
                      compatibility.canDirectPlay
                        ? "status-success"
                        : transcodingStatus === "completed"
                        ? "status-success"
                        : transcodingStatus === "active"
                        ? "status-warning"
                        : "status-error"
                    }`}
                  ></span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {playbackMode === "direct"
                      ? "Direct Play (Forced)"
                      : playbackMode === "transcode"
                      ? "Transcoding (Forced)"
                      : compatibility.canDirectPlay
                      ? "Direct Play"
                      : `Transcoding ${
                          transcodingStatus === "loading"
                            ? "Starting..."
                            : transcodingStatus.charAt(0).toUpperCase() +
                              transcodingStatus.slice(1)
                        }`}
                  </span>
                </div>
              )}

              {/* Reset Button */}
              <button
                onClick={() => {
                  if (playerRef.current) {
                    playerRef.current.dispose();
                    playerRef.current = null;
                  }
                  setVideo(null);
                  setSessionId(null);
                  setTranscodingStatus("loading");
                  setShowPoster(true);
                  setIsInitializing(false);
                }}
                className="btn text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  padding: "8px 12px",
                }}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </section>

        {/* Video information grid */}
        <section className="container-fluid px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
            {/* Primary details */}
            <div className="lg:col-span-2">
              <div className="card">
                <div
                  className="card-header cursor-pointer"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <div className="flex items-center justify-between">
                    <h2
                      className="text-lg font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Details
                    </h2>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {showDetails ? "▼" : "▶"}
                    </span>
                  </div>
                </div>
                {showDetails && (
                  <div className="card-body">
                    {/* Studio and Release Date Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {scene.studio && (
                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Studio
                          </h3>
                          <Link
                            to={`/studio/${scene.studio.id}`}
                            className="text-base hover:underline hover:text-blue-400"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {scene.studio.name}
                          </Link>
                        </div>
                      )}

                      {scene.date && (
                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Release Date
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {new Date(scene.date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Description - Full Width */}
                    {scene.details && (
                      <div className="mb-6">
                        <h3
                          className="text-sm font-medium mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Description
                        </h3>
                        <p
                          className="text-base leading-relaxed"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {scene.details}
                        </p>
                      </div>
                    )}

                    {/* Duration */}
                    <div className="mb-6">
                      <h3
                        className="text-sm font-medium mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Duration
                      </h3>
                      <p
                        className="text-base"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatDuration(scene.files?.[0]?.duration)}
                      </p>
                    </div>

                    {/* Performers */}
                    {scene.performers && scene.performers.length > 0 && (
                      <div className="mb-6">
                        <h3
                          className="text-sm font-medium mb-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Performers
                        </h3>
                        <div className="flex flex-wrap gap-3">
                          {scene.performers.map((performer) => (
                            <Link
                              key={performer.id}
                              to={`/performer/${performer.id}`}
                              className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: "var(--bg-secondary)" }}
                            >
                              {/* Placeholder for performer thumbnail */}
                              <div
                                className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center"
                                style={{
                                  backgroundColor: "var(--border-color)",
                                }}
                              >
                                <span
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {performer.gender === "MALE" ? "♂" : "♀"}
                                </span>
                              </div>
                              <span
                                className="text-sm font-medium"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {performer.name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {scene.tags && scene.tags.length > 0 && (
                      <div>
                        <h3
                          className="text-sm font-medium mb-3"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Tags
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {scene.tags.map((tag) => (
                            <Link
                              key={tag.id}
                              to={`/tag/${tag.id}`}
                              className="flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: "var(--bg-secondary)" }}
                            >
                              {/* Placeholder for tag thumbnail */}
                              <div
                                className="w-4 h-4 rounded bg-gray-300"
                                style={{
                                  backgroundColor: "var(--border-color)",
                                }}
                              ></div>
                              <span
                                className="text-sm"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {tag.name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Technical details sidebar */}
            <div>
              <div className="card">
                <div
                  className="card-header cursor-pointer"
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                >
                  <div className="flex items-center justify-between">
                    <h2
                      className="text-lg font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Technical Details
                    </h2>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {showTechnicalDetails ? "▼" : "▶"}
                    </span>
                  </div>
                </div>
                {showTechnicalDetails && (
                  <div className="card-body">
                    {firstFile && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Resolution
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.width} × {firstFile.height}
                          </p>
                        </div>

                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Video Codec
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.video_codec?.toUpperCase() || "Unknown"}
                          </p>
                        </div>

                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Audio Codec
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.audio_codec?.toUpperCase() || "Unknown"}
                          </p>
                        </div>

                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            File Size
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {formatFileSize(firstFile.size)}
                          </p>
                        </div>

                        <div>
                          <h3
                            className="text-sm font-medium mb-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Format
                          </h3>
                          <p
                            className="text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {firstFile.format?.toUpperCase() || "Unknown"}
                          </p>
                        </div>

                        {firstFile.bitrate && (
                          <div>
                            <h3
                              className="text-sm font-medium mb-1"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Bitrate
                            </h3>
                            <p
                              className="text-base"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {Math.round(firstFile.bitrate / 1000)} kbps
                            </p>
                          </div>
                        )}

                        {firstFile.frame_rate && (
                          <div>
                            <h3
                              className="text-sm font-medium mb-1"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Frame Rate
                            </h3>
                            <p
                              className="text-base"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {firstFile.frame_rate} fps
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {compatibility && (
                      <div
                        className="mt-6 pt-4"
                        style={{ borderTop: "1px solid var(--border-color)" }}
                      >
                        <h3
                          className="text-sm font-medium mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Playback Method
                        </h3>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {compatibility.reason}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default VideoPlayer;
