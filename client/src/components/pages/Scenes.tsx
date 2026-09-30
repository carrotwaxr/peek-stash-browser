import { usePageTitle } from "../../hooks/usePageTitle";
import SceneSearch from "../scene-search/SceneSearch";

const Scenes = () => {
  usePageTitle("Scenes");

  return (
    <SceneSearch
      context="scene"
      initialSort="created_at"
      subtitle="Browse your complete scene library"
      title="All Scenes"
      fromPageTitle="Scenes"
    />
  );
};

export default Scenes;
