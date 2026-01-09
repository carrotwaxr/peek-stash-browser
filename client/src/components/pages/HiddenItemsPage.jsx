import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useHiddenEntities } from "../../hooks/useHiddenEntities.js";
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { getSceneTitle } from "../../utils/format.js";
import {
  Button,
  EmptyState,
  LazyImage,
  LoadingSpinner,
  PageHeader,
  PageLayout,
  TabNavigation,
} from "../ui/index.js";

/**
 * HiddenItemsPage - View and restore hidden entities
 */
const HiddenItemsPage = () => {
  const { getHiddenEntities, unhideEntity, unhideAll } = useHiddenEntities();
  const [activeTab, setActiveTab] = useState("all");
  const [hiddenItems, setHiddenItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringAll, setRestoringAll] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  const tabs = [
    { id: "all", label: "All" },
    { id: "scene", label: "Scenes" },
    { id: "performer", label: "Performers" },
    { id: "studio", label: "Studios" },
    { id: "tag", label: "Tags" },
    { id: "group", label: "Collections" },
    { id: "gallery", label: "Galleries" },
    { id: "image", label: "Images" },
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

  const handleRestore = async (item) => {
    const entityName = getEntityName(item);
    const success = await unhideEntity({
      entityType: item.entityType,
      entityId: item.entityId,
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
  const groupedItems =
    activeTab === "all"
      ? hiddenItems.reduce((acc, item) => {
          if (!acc[item.entityType]) {
            acc[item.entityType] = [];
          }
          acc[item.entityType].push(item);
          return acc;
        }, {})
      : { [activeTab]: hiddenItems };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const capitalizeType = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  /**
   * Get display name for an entity based on its type
   */
  const getEntityName = (item) => {
    if (!item.entity) return "Unknown";

    // Scenes use getSceneTitle which handles basename fallback
    if (item.entityType === "scene") {
      return getSceneTitle(item.entity);
    }

    // Other entities use name or title
    return item.entity.name || item.entity.title || "Unknown";
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

      <TabNavigation tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : hiddenItems.length === 0 ? (
          <EmptyState
            message={
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
                    const hasImage = item.entity?.image_path;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 p-3 rounded border"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {/* Thumbnail */}
                        {hasImage && (
                          <LazyImage
                            src={`/api/proxy/stash?path=${encodeURIComponent(
                              item.entity.image_path
                            )}`}
                            alt={entityName}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}

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
                            Hidden on {formatDate(item.hiddenAt)}
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
