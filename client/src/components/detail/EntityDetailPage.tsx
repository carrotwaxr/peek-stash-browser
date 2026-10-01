import type { ReactNode } from "react";
import type { EntityDetail } from "../../api/hooks/useEntityDetail";
import type { DetailType } from "../../api/library";
import EntityNotFound from "../ui/EntityNotFound";
import LibraryInitializingBanner from "../ui/LibraryInitializingBanner";
import LoadingSpinner from "../ui/LoadingSpinner";

/** The found state of a detail page's lookup */
export type FoundEntityDetail<T extends DetailType> = Extract<
  EntityDetail<T>,
  { status: "found" }
>;

interface Props<T extends DetailType> {
  type: T;
  /** The page's `useEntityDetail` answer */
  detail: EntityDetail<T>;
  /** The page, for the found entity */
  children: (detail: FoundEntityDetail<T>) => ReactNode;
}

/**
 * A detail page's lookup states: a spinner (with the initializing banner
 * while the library syncs) while it loads; not found, a choice of servers
 * or an error with Retry; else the page.
 */
const EntityDetailPage = <T extends DetailType>({
  type,
  detail,
  children,
}: Props<T>) => {
  switch (detail.status) {
    case "loading":
      return (
        <div className="min-h-screen flex flex-col items-center justify-center">
          <LibraryInitializingBanner />
          <LoadingSpinner />
        </div>
      );
    case "notFound":
      return <EntityNotFound entityType={type} status="notFound" />;
    case "ambiguous":
      return (
        <EntityNotFound
          entityType={type}
          status="ambiguous"
          matches={detail.matches}
        />
      );
    case "error":
      return (
        <EntityNotFound
          entityType={type}
          status="error"
          error={detail.error}
          onRetry={detail.retry}
        />
      );
    case "found":
      return children(detail);
  }
};

export default EntityDetailPage;
