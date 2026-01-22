import { useRef } from "react";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import ClipSearch from "../clip-search/ClipSearch.jsx";

const Clips = () => {
  usePageTitle("Clips");
  const pageRef = useRef(null);

  // Set initial focus to first clip card when page loads
  useInitialFocus(pageRef, '[tabindex="0"]', true);

  return (
    <div ref={pageRef}>
      <ClipSearch
        context="clip"
        initialSort="stashCreatedAt"
        subtitle="Browse your clip library"
        title="All Clips"
        fromPageTitle="Clips"
      />
    </div>
  );
};

export default Clips;
