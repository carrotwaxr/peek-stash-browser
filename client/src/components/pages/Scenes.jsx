import SceneSearch from "../scene-search/SceneSearch.jsx";

const Scenes = () => {
  return (
    <SceneSearch
      initialSort="created_at"
      subtitle="Browse your complete scene library"
      title="All Scenes"
    />
  );
};

export default Scenes;
