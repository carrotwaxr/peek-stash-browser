import { useNavigate } from "react-router-dom";
import SceneCarousel from "./SceneCarousel.jsx";
import { useHomeData } from "../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "./ui/index.js";

const Home = () => {
  const navigate = useNavigate();
  const { favorites, recent, longVideos, loading, error } = useHomeData();

  // Extract scenes from API responses
  const favoriteScenes = favorites.data || [];
  const recentScenes = recent.data || [];
  const longVideoScenes = longVideos.data || [];

  console.log("favoriteScenes", favoriteScenes);
  console.log("recentScenes", recentScenes);
  console.log("longVideoScenes", longVideoScenes);

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data
    navigate(`/video/${scene.id}`, { state: { scene } });
  };

  if (error) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8 max-w-none">
        <PageHeader
          title="Welcome Home - HOT RELOADING WORKS! 🔥"
          subtitle="Discover your favorite content and explore new scenes"
        />
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-4 lg:px-6 xl:px-8 max-w-none">
      <PageHeader
        title="Welcome Home"
        subtitle="Discover your favorite content and explore new scenes"
      />

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!loading && (
        <>
          {/* High-Rated Section */}
          <SceneCarousel
            title="⭐ High Rated"
            scenes={favoriteScenes}
            loading={favorites.loading}
            onSceneClick={handleSceneClick}
          />

          {/* Recently Added Section */}
          <SceneCarousel
            title="🆕 Recently Added"
            scenes={recentScenes}
            loading={recent.loading}
            onSceneClick={handleSceneClick}
          />

          {/* Long Videos Section */}
          <SceneCarousel
            title="🎬 Feature Length"
            scenes={longVideoScenes}
            loading={longVideos.loading}
            onSceneClick={handleSceneClick}
          />

          {/* Quick Stats */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Library Stats
              </h3>
              <p style={{ color: "var(--text-muted)" }}>
                {favoriteScenes.length +
                  recentScenes.length +
                  longVideoScenes.length}{" "}
                scenes featured
              </p>
            </div>

            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Recent Activity
              </h3>
              <p style={{ color: "var(--text-muted)" }}>
                Check out the latest additions to your library
              </p>
            </div>

            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Personalized
              </h3>
              <p style={{ color: "var(--text-muted)" }}>
                Content curated based on ratings and length
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Home;
