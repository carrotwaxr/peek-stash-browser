import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { HiddenEntityItem, HiddenEntityType } from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { queryKeys } from "../../api/queryKeys";
import {
  HIDDEN_ITEMS_PER_PAGE,
  useHiddenEntities,
  useHiddenItems,
} from "../../hooks/useHiddenEntities";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { formatDate } from "../../utils/date";
import Button from "../ui/Button";
import { LazyImage } from "../ui/CardComponents";
import EmptyState from "../ui/EmptyState";
import LoadingSpinner from "../ui/LoadingSpinner";
import PageHeader from "../ui/PageHeader";
import PageLayout from "../ui/PageLayout";
import Pagination from "../ui/Pagination";
import TabNavigation, { TAB_COUNT_LOADING } from "../ui/TabNavigation";

type TabId = HiddenEntityType | "all";

const TYPE_TABS: ReadonlyArray<{ id: HiddenEntityType; label: string }> = [
  { id: "scene", label: "Scenes" },
  { id: "performer", label: "Performers" },
  { id: "studio", label: "Studios" },
  { id: "tag", label: "Tags" },
  { id: "group", label: "Collections" },
  { id: "gallery", label: "Galleries" },
  { id: "image", label: "Images" },
  { id: "clip", label: "Clips" },
];

const ENTITY_TYPE_LABELS: Record<HiddenEntityType, string> = {
  scene: "Scene",
  performer: "Performer",
  studio: "Studio",
  tag: "Tag",
  group: "Collection",
  gallery: "Gallery",
  image: "Image",
  clip: "Clip",
};

const isTabId = (value: string | null): value is TabId =>
  value === "all" || TYPE_TABS.some((tab) => tab.id === value);

/** The row's name, else its type (a row without details) */
const getEntityName = (item: HiddenEntityItem): string =>
  item.summary?.name ?? ENTITY_TYPE_LABELS[item.entityType];

/**
 * HiddenItemsPage - View and restore hidden entities, a page of 50 at a
 * time, with how many of each type the user hid on the tabs.
 *
 * A hidden item the user may no longer see (restricted for them, or gone
 * from the library) comes without its details; it shows as its type, and
 * Restore still removes it. A thumbnail is the server's proxy URL, used as
 * it is.
 */
const HiddenItemsPage = () => {
  usePageTitle("Hidden Items");
  const { unhideEntity, unhideAll } = useHiddenEntities();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // The URL names the tab, so the highlighted tab, the list and Back agree
  const urlTab = searchParams.get("tab");
  const activeTab: TabId = isTabId(urlTab) ? urlTab : "all";
  // A tab starts on its first page, whichever way the URL brought us to it
  const [pageOf, setPageOf] = useState({ tab: activeTab, page: 1 });
  const page = pageOf.tab === activeTab ? pageOf.page : 1;
  const setPage = (next: number) => {
    setPageOf({ tab: activeTab, page: next });
  };
  const [restoringAll, setRestoringAll] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  const { data, isLoading } = useHiddenItems(activeTab, page);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / HIDDEN_ITEMS_PER_PAGE);

  // A restore can empty the last page: step back to the new last one
  useEffect(() => {
    if (data && page > 1 && page > totalPages) {
      setPageOf({ tab: activeTab, page: Math.max(1, totalPages) });
    }
  }, [data, page, totalPages, activeTab]);

  const tabCount = (id: TabId): number => {
    if (!data) return TAB_COUNT_LOADING;
    return id === "all"
      ? Object.values(data.counts).reduce((sum, n) => sum + n, 0)
      : data.counts[id];
  };

  const tabs = [
    { id: "all", label: "All", count: tabCount("all") },
    ...TYPE_TABS.map((tab) => ({ ...tab, count: tabCount(tab.id) })),
  ];

  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.user.hiddenEntities(),
    });

  const handleRestore = async (item: HiddenEntityItem) => {
    const success = await unhideEntity({
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: getEntityName(item),
      // A row stored for every instance ("") is removed without one
      instanceId: item.instanceId || undefined,
    });

    if (success) {
      await refreshList();
    }
  };

  const handleRestoreAll = async () => {
    if (items.length === 0) return;

    setRestoringAll(true);
    const success = await unhideAll(
      activeTab === "all" ? undefined : activeTab
    );

    if (success) {
      setPage(1);
      await refreshList();
    }
    setRestoringAll(false);
  };

  // Group the page's items by type on the "All" tab
  const groupedItems: Array<[HiddenEntityType, HiddenEntityItem[]]> =
    activeTab === "all"
      ? TYPE_TABS.map((tab): [HiddenEntityType, HiddenEntityItem[]] => [
          tab.id,
          items.filter((item) => item.entityType === tab.id),
        ]).filter(([, typeItems]) => typeItems.length > 0)
      : [[activeTab, items]];

  const tabLabel = (type: HiddenEntityType) =>
    TYPE_TABS.find((tab) => tab.id === type)?.label ?? type;

  return (
    <PageLayout>
      {/* Back Button */}
      <div className="mt-6 mb-4">
        <Button
          onClick={goBack}
          variant="secondary"
          icon={<ArrowLeft size={16} />}
          title={backButtonText}
        >
          <span className="hidden sm:inline">{backButtonText}</span>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Hidden Items" />
        {items.length > 0 && (
          <Button
            variant="destructive"
            icon={<RotateCcw size={18} />}
            onClick={() => void handleRestoreAll()}
            loading={restoringAll}
            disabled={restoringAll}
          >
            Restore All {activeTab !== "all" ? tabLabel(activeTab) : ""}
          </Button>
        )}
      </div>

      <TabNavigation tabs={tabs} defaultTab="all" />

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={
              activeTab === "all"
                ? "No hidden items"
                : `No hidden ${tabLabel(activeTab).toLowerCase()}`
            }
            description="Items you hide will appear here and can be restored at any time."
          />
        ) : (
          <div className="space-y-6">
            {groupedItems.map(([type, typeItems]) => (
              <div key={type}>
                {activeTab === "all" && (
                  <h2
                    className="text-lg font-semibold mb-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {tabLabel(type)} ({data?.counts[type] ?? typeItems.length})
                  </h2>
                )}

                <div className="space-y-2">
                  {typeItems.map((item) => {
                    const entityName = getEntityName(item);
                    const imageUrl = item.summary?.imageUrl;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 p-3 rounded border"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {/* Thumbnail: the server's proxy URL, as it is */}
                        {imageUrl ? (
                          <LazyImage
                            src={imageUrl}
                            alt={entityName}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : null}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div
                            className="font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {entityName}
                          </div>
                          <div
                            className="text-sm opacity-70"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {item.summary === null && "Details unavailable · "}
                            Hidden on {formatDate(item.hiddenAt)}
                          </div>
                        </div>

                        {/* Restore button */}
                        <button
                          onClick={() => void handleRestore(item)}
                          className="px-4 py-2 rounded transition-colors"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            color: "var(--text-on-accent)",
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              perPage={HIDDEN_ITEMS_PER_PAGE}
              totalCount={total}
              showPerPageSelector={false}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default HiddenItemsPage;
