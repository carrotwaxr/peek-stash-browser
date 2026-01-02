import { useEffect, useState } from "react";
import { usePaginatedLightbox } from "../../hooks/usePaginatedLightbox.js";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, LucideStar } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { libraryApi } from "../../services/api.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  LazyImage,
  Lightbox,
  LoadingSpinner,
  PageHeader,
  Pagination,
  RatingSlider,
  TabNavigation,
} from "../ui/index.js";
import { GalleryGrid, GroupGrid, PerformerGrid, StudioGrid } from "../grids/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const TagDetail = () => {
  const { tagId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [tag, setTag] = useState(null);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Include sub-tags toggle state (from URL param or default false)
  const includeSubTags = searchParams.get('includeSubTags') === 'true';

  // Get active tab from URL or default to 'scenes'
  const activeTab = searchParams.get('tab') || 'scenes';

  // Handler for toggling include sub-tags
  const handleIncludeSubTagsChange = (checked) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set('includeSubTags', 'true');
    } else {
      newParams.delete('includeSubTags');
    }
    setSearchParams(newParams);
  };

  // Check if tag has children (for showing toggle)
  const hasChildren = tag?.children && tag.children.length > 0;

  // Set page title to tag name
  usePageTitle(tag?.name || "Tag");

  useEffect(() => {
    const fetchTag = async () => {
      try {
        setIsLoading(true);
        const tagData = await getTag(tagId);
        setTag(tagData);
        setRating(tagData.rating);
        setIsFavorite(tagData.favorite || false);
      } catch {
        // Error loading tag - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchTag();
  }, [tagId]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("tag", tagId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(tag.rating);
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("tag", tagId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(tag.favorite || false);
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!tag,
    setRating: handleRatingChange,
    toggleFavorite,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // If tag not found after loading, show error and back button
  if (!tag) {
    return (
      <div className="min-h-screen px-4 lg:px-6 xl:px-8">
        <div className="max-w-none">
          <div className="mt-6 mb-6">
            <Button
              onClick={() => navigate(location.state?.referrerUrl || "/tags")}
              variant="secondary"
              icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
              title="Back to Tags"
            >
              <span className="hidden sm:inline">Back to Tags</span>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center py-16">
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Tag Not Found
            </h2>
            <p
              className="text-center mb-6"
              style={{ color: "var(--text-muted)" }}
            >
              The tag you're looking for could not be found or you don't have
              permission to view it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Back Button */}
        <div className="mt-6 mb-6">
          <Button
            onClick={() => navigate(location.state?.referrerUrl || "/tags")}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Tags"
          >
            <span className="hidden sm:inline">Back to Tags</span>
          </Button>
        </div>

        {/* Tag Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex gap-4 items-center">
                <span>{tag?.name || `Tag ${tagId}`}</span>
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="large"
                />
                <ViewInStashButton stashUrl={tag?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              tag?.aliases?.length
                ? `Also known as: ${tag?.aliases.join(", ")}`
                : null
            }
          />

          {/* Rating Slider */}
          <div className="mt-4 max-w-md">
            <RatingSlider
              rating={rating}
              onChange={handleRatingChange}
              showClearButton={true}
            />
          </div>
        </div>

        {/* Two Column Layout - Image on left, Details on right (lg+) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* Left Column: Tag Image (1:1) */}
          <div className="w-full lg:w-1/2 flex-shrink-0">
            <TagImage tag={tag} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
            {tag?.description && (
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {tag.description}
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* Full Width Sections - Statistics, Parents, Children, Aliases */}
        <div className="space-y-6 mb-8">
          <TagStats tag={tag} tagId={tagId} />
          <TagDetails tag={tag} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {/* Include Sub-Tags Toggle - only show if tag has children */}
          {hasChildren && (
            <div className="mb-4 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSubTags}
                  onChange={(e) => handleIncludeSubTagsChange(e.target.checked)}
                  className="w-4 h-4 rounded border-2 cursor-pointer"
                  style={{
                    borderColor: "var(--border-color)",
                    accentColor: "var(--accent-primary)",
                  }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Include sub-tags ({tag.children.length})
                </span>
              </label>
            </div>
          )}

          <TabNavigation
            tabs={[
              { id: 'scenes', label: 'Scenes', count: tag.scene_count || 0 },
              { id: 'galleries', label: 'Galleries', count: tag.gallery_count || 0 },
              { id: 'images', label: 'Images', count: tag.image_count || 0 },
              { id: 'performers', label: 'Performers', count: tag.performer_count || 0 },
              { id: 'studios', label: 'Studios', count: tag.studio_count || 0 },
              { id: 'groups', label: 'Collections', count: tag.group_count || 0 },
            ]}
            defaultTab="scenes"
          />

          {/* Tab Content */}
          {activeTab === 'scenes' && (
            <SceneSearch
              key={`scenes-${includeSubTags}`}
              context="scene_tag"
              permanentFilters={{
                tags: {
                  value: [parseInt(tagId, 10)],
                  modifier: "INCLUDES",
                  ...(includeSubTags && { depth: -1 }),
                },
              }}
              permanentFiltersMetadata={{
                tags: [{ id: tagId, name: tag?.name || "Unknown Tag" }],
              }}
              title={`Scenes tagged with ${tag?.name || "this tag"}${includeSubTags ? " (and sub-tags)" : ""}`}
              captureReferrer={false}
            />
          )}

          {activeTab === 'galleries' && (
            <GalleryGrid
              key={`galleries-${includeSubTags}`}
              lockedFilters={{
                gallery_filter: {
                  tags: {
                    value: [parseInt(tagId, 10)],
                    modifier: "INCLUDES",
                    ...(includeSubTags && { depth: -1 }),
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No galleries found with tag "${tag?.name}"`}
            />
          )}

          {activeTab === 'images' && (
            <ImagesTab tagId={tagId} tagName={tag?.name} includeSubTags={includeSubTags} />
          )}

          {activeTab === 'performers' && (
            <PerformerGrid
              lockedFilters={{
                performer_filter: {
                  tags: {
                    value: [parseInt(tagId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No performers found with tag "${tag?.name}"`}
            />
          )}

          {activeTab === 'studios' && (
            <StudioGrid
              lockedFilters={{
                studio_filter: {
                  tags: {
                    value: [parseInt(tagId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No studios found with tag "${tag?.name}"`}
            />
          )}

          {activeTab === 'groups' && (
            <GroupGrid
              lockedFilters={{
                group_filter: {
                  tags: {
                    value: [parseInt(tagId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No collections found with tag "${tag?.name}"`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Reusable component for Card wrapper
const Card = ({ title, children }) => {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

// Tag Image Component (16:9 aspect ratio to match tag cards)
const TagImage = ({ tag }) => {
  return (
    <div
      className="rounded-lg w-full aspect-video overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        maxHeight: "80vh",
      }}
    >
      {tag?.image_path ? (
        <img
          src={tag.image_path}
          alt={tag.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg
            className="w-24 h-24"
            style={{ color: "var(--text-muted)" }}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M7.5 3A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06L13.94 2.94A1.5 1.5 0 0012.879 2.5H7.5z" />
          </svg>
        </div>
      )}
    </div>
  );
};

// Tag Stats Component
const TagStats = ({ tag, tagId: _tagId }) => { // eslint-disable-line no-unused-vars
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'scenes';

  const handleTabSwitch = (tabId) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabId === 'scenes') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tabId);
    }
    setSearchParams(newParams);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const StatField = ({ label, value, valueColor = "var(--text-primary)", onClick, isActive }) => {
    if (!value && value !== 0) return null;

    const clickable = onClick && value > 0;

    return (
      <div className="flex justify-between">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        {clickable ? (
          <button
            onClick={onClick}
            disabled={isActive}
            className="font-medium transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-100"
            style={{
              color: valueColor,
              cursor: isActive ? 'default' : 'pointer',
              textDecoration: isActive ? 'underline' : 'none',
            }}
          >
            {value}
          </button>
        ) : (
          <span className="font-medium" style={{ color: valueColor }}>
            {value}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card title="Statistics">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField
          label="Scenes:"
          value={tag?.scene_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('scenes')}
          isActive={activeTab === 'scenes'}
        />
        <StatField
          label="Markers:"
          value={tag?.scene_marker_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Images:"
          value={tag?.image_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('images')}
          isActive={activeTab === 'images'}
        />
        <StatField
          label="Galleries:"
          value={tag?.gallery_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('galleries')}
          isActive={activeTab === 'galleries'}
        />
        <StatField
          label="Performers:"
          value={tag?.performer_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('performers')}
          isActive={activeTab === 'performers'}
        />
        <StatField
          label="Studios:"
          value={tag?.studio_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('studios')}
          isActive={activeTab === 'studios'}
        />
        <StatField
          label="Collections:"
          value={tag?.group_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('groups')}
          isActive={activeTab === 'groups'}
        />
      </div>
    </Card>
  );
};

// Tag Details Component (Parent Tags, Child Tags, Aliases)
const TagDetails = ({ tag }) => {
  return (
    <>
      {tag?.parents && tag.parents.length > 0 && (
        <Card title="Parent Tags">
          <div className="flex flex-wrap gap-2">
            {tag.parents.map((parent) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(parent.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={parent.id}
                  to={`/tag/${parent.id}`}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {parent.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tag?.children && tag.children.length > 0 && (
        <Card title="Child Tags">
          <div className="flex flex-wrap gap-2">
            {tag.children.map((child) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(child.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={child.id}
                  to={`/tag/${child.id}`}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {child.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
};

// Images Tab Component with Lightbox
const ImagesTab = ({ tagId, tagName, includeSubTags = false }) => {
  const [images, setImages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const perPage = 100;

  // Paginated lightbox state and handlers
  const lightbox = usePaginatedLightbox({
    perPage,
    totalCount,
  });

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setIsLoading(true);
        const data = await libraryApi.findImages({
          filter: {
            page: lightbox.currentPage,
            per_page: perPage,
          },
          image_filter: {
            tags: {
              value: [parseInt(tagId, 10)],
              modifier: "INCLUDES",
              ...(includeSubTags && { depth: -1 }),
            },
          },
        });
        setImages(data.findImages?.images || []);
        setTotalCount(data.findImages?.count || 0);

        // Handle pending lightbox navigation after page loads
        lightbox.consumePendingLightboxIndex();
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId, lightbox.currentPage, includeSubTags]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 mt-6">
        {[...Array(12)].map((_, index) => (
          <div
            key={index}
            className="aspect-square rounded-lg animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
            }}
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div
        className="text-center py-12 mt-6"
        style={{ color: "var(--text-muted)" }}
      >
        No images found with tag "{tagName}"
      </div>
    );
  }

  return (
    <>
      {/* Pagination - Top */}
      {lightbox.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={lightbox.currentPage}
            totalPages={lightbox.totalPages}
            onPageChange={lightbox.setCurrentPage}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 mt-6">
        {images.map((image, index) => (
          <LazyImage
            key={image.id}
            src={image.paths?.thumbnail}
            alt={image.title || `Image ${index + 1}`}
            className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 hover:scale-105 transition-all border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
            onClick={() => lightbox.openLightbox(index)}
          />
        ))}
      </div>

      {/* Pagination - Bottom */}
      {lightbox.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={lightbox.currentPage}
            totalPages={lightbox.totalPages}
            onPageChange={lightbox.setCurrentPage}
          />
        </div>
      )}

      {/* Lightbox */}
      <Lightbox
        images={images}
        initialIndex={lightbox.lightboxIndex}
        isOpen={lightbox.lightboxOpen}
        autoPlay={false}
        onClose={lightbox.closeLightbox}
        onImagesUpdate={setImages}
        onPageBoundary={lightbox.onPageBoundary}
        totalCount={totalCount}
        pageOffset={lightbox.pageOffset}
        onIndexChange={lightbox.onIndexChange}
      />
    </>
  );
};

const getTag = async (id) => {
  return await libraryApi.findTagById(id);
};

export default TagDetail;
