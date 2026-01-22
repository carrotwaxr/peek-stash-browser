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
    <div ref={pageRef} className="container mx-auto px-4 py-6">
      <ClipSearch />
    </div>
  );
};

export default Clips;
