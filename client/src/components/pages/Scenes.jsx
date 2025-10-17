import SceneSearch from "../scene-search/SceneSearch.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const Scenes = () => {
  usePageTitle("Scenes");
  return (
    <SceneSearch
      initialSort="created_at"
      subtitle="Browse your complete scene library"
      title="All Scenes"
    />
  );
};

export default Scenes;
