import { useState, useEffect } from "react";
import SceneCarousel from "./SceneCarousel.jsx";

const Home = () => {
  const [favoriteScenes, setFavoriteScenes] = useState([]);
  const [recentScenes, setRecentScenes] = useState([]);
  const [recommendedScenes, setRecommendedScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data for different carousel sections
  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        setLoading(true);

        // Fetch all scenes first - in a real app, these would be separate endpoints
        const response = await fetch("/api/scenes");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        console.log("responseData", responseData);
        // Extract scenes array from the nested API response structure
        const allScenes = responseData.findScenes?.scenes || [];
        console.log("allScenes", allScenes);
        // For now, we'll simulate different sections by filtering/sorting the scenes
        // In a real implementation, these would be separate API calls with specific filters

        // Favorites: scenes with high ratings (simulate user favorites)
        const favorites = allScenes
          //.filter((scene) => scene.rating && scene.rating >= 4)
          .slice(0, 12);

        // Recently Added: sorted by date descending
        const recent = [...allScenes]
          .sort(
            (a, b) =>
              new Date(b.created_at || b.date) -
              new Date(a.created_at || a.date)
          )
          .slice(0, 12);

        // Recommended: scenes with performers or studios user might like
        // For now, just shuffle and take random scenes
        const recommended = [...allScenes]
          .sort(() => Math.random() - 0.5)
          .slice(0, 12);

        setFavoriteScenes(favorites);
        setRecentScenes(recent);
        setRecommendedScenes(recommended);
      } catch (err) {
        console.error("Error fetching home data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, []);

  console.log("favorites", favoriteScenes);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Welcome Home
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Discover your favorite content and explore new scenes
        </p>
      </div>

      {/* Favorites Section */}
      <SceneCarousel
        title="⭐ Favorites"
        scenes={favoriteScenes}
        loading={loading}
      />

      {/* Recently Added Section */}
      <SceneCarousel
        title="🆕 Recently Added"
        scenes={recentScenes}
        loading={loading}
      />

      {/* Recommended Section */}
      <SceneCarousel
        title="✨ Recommended for You"
        scenes={recommendedScenes}
        loading={loading}
      />

      {/* Quick Stats or Additional Info */}
      {!loading && (
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
                recommendedScenes.length}{" "}
              scenes available
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
              Recommendations based on your viewing history
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
