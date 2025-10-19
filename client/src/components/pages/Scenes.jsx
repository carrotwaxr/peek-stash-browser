import { useRef } from "react";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";

const Scenes = () => {
  usePageTitle("Scenes");
  const pageRef = useRef(null);

  // Set initial focus to first scene card when page loads
  useInitialFocus(pageRef, '[tabindex="0"]', true);

  return (
    <div ref={pageRef}>
      <SceneSearch
        initialSort="created_at"
        subtitle="Browse your complete scene library"
        title="All Scenes"
      />
    </div>
  );
};

export default Scenes;
