const VideoPoster = ({
  scene,
  isInitializing,
  isLoadingAPI,
  isAutoFallback,
  onPlay,
}) => {
  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer group ${
        scene.paths?.screenshot ? "bg-black" : "video-poster"
      }`}
      onClick={onPlay}
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

      {/* Loading indicator */}
      {(isInitializing || isLoadingAPI || isAutoFallback) && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-3"></div>
            <p>
              {isAutoFallback
                ? "Preparing transcoded stream..."
                : isLoadingAPI
                ? "Connecting to server..."
                : "Loading video..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPoster;
