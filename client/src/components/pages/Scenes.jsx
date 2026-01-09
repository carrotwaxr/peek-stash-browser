import { useRef } from "react";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";

const Scenes = () => {
  usePageTitle("Scenes");
  const pageRef = useRef(null);

  // Set initial focus to first scene card when page loads
  useInitialFocus(pageRef, '[tabindex="0"]', true);

  return (
    <div ref={pageRef}>
      <SceneSearch
        context="scene"
        initialSort="created_at"
        subtitle="Browse your complete scene library"
        title="All Scenes"
        fromPageTitle="Scenes"
      />
    </div>
  );
};

export default Scenes;
