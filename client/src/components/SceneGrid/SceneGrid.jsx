import { SceneGridItem } from "./SceneGridItem.jsx";

export const SceneGrid = ({ scenes }) => {
  if (!scenes || scenes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
            🎬
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            No scenes found
          </h3>
          <p style={{ color: "var(--text-secondary)" }}>
            Check your media library configuration
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
      {scenes.map((scene) => (
        <SceneGridItem key={scene.id} scene={scene} />
      ))}
    </div>
  );
};
