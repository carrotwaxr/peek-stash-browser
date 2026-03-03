import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useHiddenEntities } from "../../hooks/useHiddenEntities";
import { useNavigationState } from "../../hooks/useNavigationState";
import { getSceneTitle } from "../../utils/format";
import {
  Button,
  EmptyState,
  LazyImage,
  LoadingSpinner,
  PageHeader,
  PageLayout,
  TabNavigation,
  TAB_COUNT_LOADING,
} from "../ui/index";

/**
 * HiddenItemsPage - View and restore hidden entities
 */
const HiddenItemsPage = () => {
  const { getHiddenEntities, unhideEntity, unhideAll } = useHiddenEntities();
  const [activeTab, setActiveTab] = useState("all");
  const [hiddenItems, setHiddenItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringAll, setRestoringAll] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  const tabs = [
    { id: "all", label: "All", count: TAB_COUNT_LOADING as number },
    { id: "scene", label: "Scenes", count: TAB_COUNT_LOADING as number },
    { id: "performer", label: "Performers", count: TAB_COUNT_LOADING as number },
    { id: "studio", label: "Studios", count: TAB_COUNT_LOADING as number },
    { id: "tag", label: "Tags", count: TAB_COUNT_LOADING as number },
    { id: "group", label: "Collections", count: TAB_COUNT_LOADING as number },
    { id: "gallery", label: "Galleries", count: TAB_COUNT_LOADING as number },
    { id: "image", label: "Images", count: TAB_COUNT_LOADING as number },
  ];

  const loadHiddenItems = useCallback(async () => {
    setLoading(true);
    const entityType = activeTab === "all" ? undefined : activeTab;
    const items = await getHiddenEntities(entityType);
    setHiddenItems(items);
    setLoading(false);
  }, [activeTab, getHiddenEntities]);

  useEffect(() => {
    loadHiddenItems();
  }, [loadHiddenItems]);

  const handleRestore = async (item: Record<string, unknown>) => {
    const entityName = getEntityName(item);
    const success = await unhideEntity({
      entityType: item.entityType as string,
      entityId: item.entityId as string,
      entityName,
    });

    if (success) {
      // Reload the list
      loadHiddenItems();
    }
  };

  const handleRestoreAll = async () => {
    if (hiddenItems.length === 0) return;

    setRestoringAll(true);
    const entityType = activeTab === "all" ? undefined : activeTab;
    const success = await unhideAll(entityType);

    if (success) {
      loadHiddenItems();
    }
    setRestoringAll(false);
  };

  // Group items by type for "All" tab
  const groupedItems: Record<string, Record<string, unknown>[]> =
    activeTab === "all"
      ? hiddenItems.reduce((acc: Record<string, Record<string, unknown>[]>, item) => {
          const type = item.entityType as string;
          if (!acc[type]) {
            acc[type] = [];
          }
          acc[type].push(item);
          return acc;
        }, {})
      : { [activeTab]: hiddenItems };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const capitalizeType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  /**
   * Get display name for an entity based on its type
   */
  const getEntityName = (item: Record<string, unknown>): string => {
    if (!item.entity) return "Unknown";

    // Scenes use getSceneTitle which handles basename fallback
    if (item.entityType === "scene") {
      return getSceneTitle(item.entity as Record<string, unknown>);
    }

    // Other entities use name or title
    const entity = item.entity as Record<string, unknown>;
    return (entity.name as string) || (entity.title as string) || "Unknown";
  };

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
        {hiddenItems.length > 0 && (
          <Button
            variant="destructive"
            icon={<RotateCcw size={18} />}
            onClick={handleRestoreAll}
            loading={restoringAll}
            disabled={restoringAll}
          >
            Restore All {activeTab !== "all" ? capitalizeType(activeTab) + "s" : ""}
          </Button>
        )}
      </div>

      <TabNavigation tabs={tabs} defaultTab="all" onTabChange={setActiveTab} />

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : hiddenItems.length === 0 ? (
          <EmptyState
            title={
              activeTab === "all"
                ? "No hidden items"
                : `No hidden ${activeTab}s`
            }
            description="Items you hide will appear here and can be restored at any time."
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([type, items]) => (
              <div key={type}>
                {activeTab === "all" && (
                  <h2
                    className="text-lg font-semibold mb-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {capitalizeType(type)}s ({items.length})
                  </h2>
                )}

                <div className="space-y-2">
                  {items.map((item) => {
                    const entityName = getEntityName(item);
                    const entity = item.entity as Record<string, unknown> | undefined;
                    const hasImage = entity?.image_path;

                    return (
                      <div
                        key={item.id as string}
                        className="flex items-center gap-4 p-3 rounded border"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {/* Thumbnail */}
                        {hasImage ? (
                          <LazyImage
                            src={`/api/proxy/stash?path=${encodeURIComponent(
                              entity?.image_path as string
                            )}`}
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
                            Hidden on {formatDate(item.hiddenAt as string)}
                          </div>
                        </div>

                        {/* Restore button */}
                        <button
                          onClick={() => handleRestore(item)}
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
      </div>
    </PageLayout>
  );
};

export default HiddenItemsPage;
