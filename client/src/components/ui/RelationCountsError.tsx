import { getErrorMessage } from "../../api/client";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import ErrorMessage from "./ErrorMessage";

interface Props {
  /** The counts request's error while no counts have loaded, else nothing */
  error: unknown;
  onRetry: () => void;
}

/**
 * What a detail page shows under its tabs when the tab counts failed to
 * load: the reason and a Retry. A library still initializing is loading, not
 * an error: the page's banner covers it and the counts come once it is ready.
 */
const RelationCountsError = ({ error, onRetry }: Props) => {
  if (!error || isLibraryInitializing(error)) return null;
  return (
    <ErrorMessage
      className="mt-6"
      title="Could not load the counts"
      error={getErrorMessage(error)}
      onRetry={onRetry}
    />
  );
};

export default RelationCountsError;
