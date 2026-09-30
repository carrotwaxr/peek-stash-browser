import { usePageTitle } from "../../hooks/usePageTitle";
import ClipSearch from "../clip-search/ClipSearch";

const Clips = () => {
  usePageTitle("Clips");

  return (
    <ClipSearch
      context="clip"
      initialSort="stashCreatedAt"
      subtitle="Browse your clip library"
      title="All Clips"
      fromPageTitle="Clips"
    />
  );
};

export default Clips;
