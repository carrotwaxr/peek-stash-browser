import { useState, useEffect } from "react";
import { SceneGrid } from "./SceneGrid/SceneGrid.jsx";

const Scenes = () => {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchScenes = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/scenes");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const responseData = await response.json();

        // Extract scenes array from the nested API response structure
        const scenes = responseData.data?.findScenes?.scenes || [];
        setScenes(scenes);
      } catch (err) {
        console.error("Error fetching scenes:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchScenes();
  }, []);

  if (error) {
    return (
      <div className="container-fluid py-8">
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
    <div className="container-fluid py-8">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          All Scenes
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Browse your complete scene library
        </p>
      </div>

      {/* Scene Grid */}
      <SceneGrid scenes={scenes} loading={loading} />
    </div>
  );
};

export default Scenes;
