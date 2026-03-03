import { useRef } from "react";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { usePageTitle } from "../../hooks/usePageTitle";
import ClipSearch from "../clip-search/ClipSearch";

const Clips = () => {
  usePageTitle("Clips");
  const pageRef = useRef<HTMLDivElement>(null);

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
