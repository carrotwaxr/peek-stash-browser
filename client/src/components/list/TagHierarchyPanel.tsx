import { useTagTree } from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import type { ListUrlState } from "../../hooks/useListUrlState";
import type { TagTreeSource } from "../../utils/buildTagTree";
import { TagHierarchyView } from "../tags/index";
import { ErrorMessage } from "../ui/index";

const NO_TAGS: readonly TagTreeSource[] = [];

/**
 * The Tags page's hierarchy view: the compact tag tree, read only while the
 * list's view is the hierarchy, searched and sorted by the list's state
 */
const TagHierarchyPanel = ({ listState }: { listState: ListUrlState }) => {
  const { data, isLoading, error, refetch } = useTagTree(
    undefined,
    listState.viewMode === "hierarchy"
  );

  if (error && !isLibraryInitializing(error)) {
    return <ErrorMessage error={error} onRetry={() => void refetch()} />;
  }

  return (
    <TagHierarchyView
      tags={data?.tags ?? NO_TAGS}
      isLoading={isLoading || !data}
      searchQuery={listState.q}
      sortField={listState.sort.field}
      sortDirection={listState.sort.direction}
    />
  );
};

export default TagHierarchyPanel;
