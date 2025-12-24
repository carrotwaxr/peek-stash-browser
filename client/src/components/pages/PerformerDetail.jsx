import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, LucideStar } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext.js";
import { formatHeight, formatWeight, formatLength } from "../../utils/unitConversions.js";
import { libraryApi } from "../../services/api.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  GenderIcon,
  LazyImage,
  Lightbox,
  LoadingSpinner,
  PageHeader,
  Pagination,
  RatingSlider,
  SectionLink,
  TabNavigation,
} from "../ui/index.js";
import { GalleryGrid, GroupGrid } from "../grids/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const PerformerDetail = () => {
  const { performerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [performer, setPerformer] = useState(null);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Get active tab from URL or default to 'scenes'
  const activeTab = searchParams.get('tab') || 'scenes';

  // Set page title to performer name
  usePageTitle(performer?.name || "Performer");

  useEffect(() => {
    const fetchPerformer = async () => {
      try {
        setIsLoading(true);
        const performerData = await getPerformer(performerId);
        setPerformer(performerData);
        setRating(performerData.rating);
        setIsFavorite(performerData.favorite || false);
      } catch {
        // Error loading performer - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchPerformer();
  }, [performerId]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("performer", performerId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(performer.rating); // Revert on error
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("performer", performerId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(performer.favorite || false); // Revert on error
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!performer,
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

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Back Button */}
        <div className="mt-6 mb-6">
          <Button
            onClick={() =>
              navigate(location.state?.referrerUrl || "/performers")
            }
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Performers"
          >
            <span className="hidden sm:inline">Back to Performers</span>
          </Button>
        </div>

        {/* Performer Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex gap-4 items-center">
                <span>{performer.name}</span>
                <GenderIcon gender={performer.gender} size={32} />
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="large"
                />
                <ViewInStashButton stashUrl={performer?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              performer?.alias_list?.length
                ? `Also known as: ${performer.alias_list.join(", ")}`
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
          {/* Left Column: Performer Image */}
          <div className="w-full lg:w-1/2 flex-shrink-0">
            <PerformerImage performer={performer} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
            <PerformerDetails performer={performer} />
          </div>
        </div>

        {/* Full Width Sections - Statistics, Tags, Links */}
        <div className="space-y-6 mb-8">
          <PerformerStats performer={performer} performerId={performerId} />
          <PerformerLinks performer={performer} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          <TabNavigation
            tabs={[
              { id: 'scenes', label: 'Scenes', count: performer.scene_count || 0 },
              { id: 'galleries', label: 'Galleries', count: performer.gallery_count || 0 },
              { id: 'images', label: 'Images', count: performer.image_count || 0 },
              { id: 'groups', label: 'Collections', count: performer.group_count || 0 },
            ]}
            defaultTab="scenes"
          />

          {/* Tab Content */}
          {activeTab === 'scenes' && (
            <SceneSearch
              context="scene_performer"
              permanentFilters={{
                performers: {
                  value: [parseInt(performerId, 10)],
                  modifier: "INCLUDES",
                },
              }}
              permanentFiltersMetadata={{
                performers: [{ id: performerId, name: performer.name }],
              }}
              title={`Scenes featuring ${performer.name}`}
              captureReferrer={false}
            />
          )}

          {activeTab === 'galleries' && (
            <GalleryGrid
              lockedFilters={{
                gallery_filter: {
                  performers: {
                    value: [parseInt(performerId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No galleries found for ${performer.name}`}
            />
          )}

          {activeTab === 'images' && (
            <ImagesTab performerId={performerId} performerName={performer?.name} />
          )}

          {activeTab === 'groups' && (
            <GroupGrid
              lockedFilters={{
                group_filter: {
                  performers: {
                    value: [parseInt(performerId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              hideLockedFilters
              syncToUrl={false}
              emptyMessage={`No collections found for ${performer.name}`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Reusable component for detail field (label/value pair)
const DetailField = ({ label, value }) => {
  if (!value) return null;

  return (
    <div>
      <dt
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </dt>
      <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
        {value}
      </dd>
    </div>
  );
};

// Reusable component for stat field (label/value pair in stats card)
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

// Reusable component for section headings
const SectionHeader = ({ children }) => {
  return (
    <h3
      className="text-sm font-medium mb-2"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </h3>
  );
};

// Reusable component for card containers
const Card = ({ children, title }) => {
  return (
    <div
      className="p-4 rounded-lg p-6 mb-6"
      style={{
        backgroundColor: "var(--bg-card)",
      }}
    >
      {title && (
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      )}

      {children}
    </div>
  );
};

const PerformerDetails = ({ performer }) => {
  const { unitPreference, isLoading: isLoadingUnits } = useUnitPreference();

  // Calculate age from birthdate
  const getAge = (birthdate) => {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      return age - 1;
    }
    return age;
  };

  const age = performer?.birthdate ? getAge(performer.birthdate) : null;

  return (
    <Card title="Details">
      {/* Personal Information */}
      <div className="mb-6">
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
          style={{
            color: "var(--text-primary)",
            borderBottom: "2px solid var(--accent-primary)",
          }}
        >
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailField
            label="Born"
            value={
              performer?.birthdate &&
              new Date(performer.birthdate).toLocaleDateString() +
                (age ? ` (${age} years old)` : "")
            }
          />
          <DetailField
            label="Died"
            value={
              performer?.death_date &&
              new Date(performer.death_date).toLocaleDateString()
            }
          />
          <DetailField label="Career" value={performer?.career_length} />
          <DetailField label="Country" value={performer?.country} />
          <DetailField label="Ethnicity" value={performer?.ethnicity} />
        </div>
      </div>

      {/* Physical Attributes */}
      <div className="mb-6">
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
          style={{
            color: "var(--text-primary)",
            borderBottom: "2px solid var(--accent-primary)",
          }}
        >
          Physical Attributes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailField label="Eye Color" value={performer?.eye_color} />
          <DetailField label="Hair Color" value={performer?.hair_color} />
          <DetailField
            label="Height"
            value={
              isLoadingUnits
                ? "..."
                : performer?.height_cm && formatHeight(performer.height_cm, unitPreference)
            }
          />
          <DetailField
            label="Weight"
            value={
              isLoadingUnits
                ? "..."
                : performer?.weight && formatWeight(performer.weight, unitPreference)
            }
          />
          <DetailField label="Measurements" value={performer?.measurements} />
          <DetailField label="Fake Tits" value={performer?.fake_tits} />
          <DetailField
            label="Penis Length"
            value={
              isLoadingUnits
                ? "..."
                : performer?.penis_length && formatLength(performer.penis_length, unitPreference)
            }
          />
          <DetailField label="Circumcised" value={performer?.circumcised} />
        </div>
      </div>

      {/* Body Modifications */}
      {(performer?.tattoos || performer?.piercings) && (
        <div className="mb-6">
          <h3
            className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
            style={{
              color: "var(--text-primary)",
              borderBottom: "2px solid var(--accent-primary)",
            }}
          >
            Body Modifications
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailField label="Tattoos" value={performer?.tattoos} />
            <DetailField label="Piercings" value={performer?.piercings} />
          </div>
        </div>
      )}

      {/* Other */}
      {performer?.disambiguation && (
        <div>
          <h3
            className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
            style={{
              color: "var(--text-primary)",
              borderBottom: "2px solid var(--accent-primary)",
            }}
          >
            Other
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <DetailField
              label="Disambiguation"
              value={performer?.disambiguation}
            />
          </div>
        </div>
      )}
    </Card>
  );
};

const PerformerStats = ({ performer, performerId: _performerId }) => { // eslint-disable-line no-unused-vars
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
    // Scroll to content area
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  // Calculate O-Count percentage
  const oCountPercentage =
    performer?.scene_count && performer?.o_counter
      ? ((performer.o_counter / performer.scene_count) * 100).toFixed(1)
      : null;

  // Cap the progress bar width at 100% but show actual percentage
  const oCountBarWidth = oCountPercentage
    ? Math.min(parseFloat(oCountPercentage), 100)
    : 0;

  return (
    <Card title="Statistics">
      {/* Basic Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatField
          label="Scenes:"
          value={performer?.scene_count || 0}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('scenes')}
          isActive={activeTab === 'scenes'}
        />
        <StatField
          label="O-Count:"
          value={performer?.o_counter || 0}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Galleries:"
          value={performer?.gallery_count || 0}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('galleries')}
          isActive={activeTab === 'galleries'}
        />
        <StatField
          label="Images:"
          value={performer?.image_count || 0}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('images')}
          isActive={activeTab === 'images'}
        />
        <StatField
          label="Collections:"
          value={performer?.group_count || 0}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('groups')}
          isActive={activeTab === 'groups'}
        />
      </div>

      {/* Visual Rating Display */}
      {performer?.rating100 && performer.rating100 > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Rating
            </span>
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--accent-primary)" }}
            >
              {performer.rating100}/100
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${performer.rating100}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* O-Count Percentage Visual */}
      {oCountPercentage && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              O-Count Rate
            </span>
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--accent-primary)" }}
            >
              {oCountPercentage}%
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${oCountBarWidth}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {performer.o_counter} O-Counts in {performer.scene_count} scenes
          </div>
        </div>
      )}
    </Card>
  );
};

const PerformerImage = ({ performer }) => {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        aspectRatio: "7/10",
        width: "100%",
        maxHeight: "80vh",
      }}
    >
      {performer?.image_path ? (
        <img
          src={performer.image_path}
          alt={performer.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : (
        <svg
          className="w-24 h-24"
          style={{ color: "var(--text-muted)" }}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );
};

const PerformerLinks = ({ performer }) => {
  const hasLinks =
    performer?.twitter ||
    performer?.instagram ||
    performer?.url ||
    performer?.urls?.length > 0;
  const hasTags = performer?.tags?.length > 0;

  if (!hasLinks && !hasTags && !performer?.details) return null;

  return (
    <>
      {/* Links Section */}
      {hasLinks && (
        <Card title="Links">
          <div className="flex flex-wrap gap-2">
            {performer?.url && <SectionLink url={performer.url} />}
            {performer?.twitter && (
              <SectionLink url={`https://twitter.com/${performer.twitter}`} />
            )}
            {performer?.instagram && (
              <SectionLink
                url={`https://instagram.com/${performer.instagram}`}
              />
            )}
            {performer?.urls?.map((url, idx) => (
              <SectionLink key={idx} url={url} />
            ))}
          </div>
        </Card>
      )}

      {/* Tags Section */}
      {hasTags && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-2">
            {performer.tags.map((tag) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(tag.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={tag.id}
                  to={`/tags/${tag.id}`}
                  className="px-3 py-1 rounded-full text-sm transition-all duration-200 hover:opacity-80 font-medium"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {tag.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Details Section */}
      {performer?.details && (
        <Card title="Details">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {performer.details}
          </p>
        </Card>
      )}
    </>
  );
};

// Images Tab Component with Lightbox
const ImagesTab = ({ performerId, performerName }) => {
  const [images, setImages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const perPage = 100;

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setIsLoading(true);
        const data = await libraryApi.findImages({
          filter: {
            page: currentPage,
            per_page: perPage,
          },
          image_filter: {
            performers: {
              value: [parseInt(performerId, 10)],
              modifier: "INCLUDES",
            },
          },
        });
        setImages(data.findImages?.images || []);
        setTotalCount(data.findImages?.count || 0);
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, [performerId, currentPage]);

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
        No images found for {performerName}
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <>
      {/* Pagination - Top */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
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
            onClick={() => {
              setLightboxIndex(index);
              setLightboxOpen(true);
            }}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Lightbox */}
      <Lightbox
        images={images}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        autoPlay={false}
        onClose={() => setLightboxOpen(false)}
        onImagesUpdate={setImages}
      />
    </>
  );
};

const getPerformer = async (id) => {
  return await libraryApi.findPerformerById(id);
};

export default PerformerDetail;
