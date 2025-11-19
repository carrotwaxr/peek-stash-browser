import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  LucideDatabase,
  LucideFacebook,
  LucideFilm,
  LucideGlobe,
  LucideInstagram,
  LucideLink,
  LucideStar,
  LucideTwitter,
  LucideVideo,
} from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { libraryApi } from "../../services/api.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  EntityGrid,
  FavoriteButton,
  GenderIcon,
  LoadingSpinner,
  PageHeader,
  RatingSlider,
  TabNavigation,
} from "../ui/index.js";

// Helper to detect and map URLs to known sites with colors
const getSiteInfo = (url) => {
  const urlLower = url.toLowerCase();

  // Social Media
  if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) {
    return { name: "Twitter", icon: LucideTwitter, color: "#1DA1F2" }; // Twitter blue
  }
  if (urlLower.includes("instagram.com")) {
    return { name: "Instagram", icon: LucideInstagram, color: "#E4405F" }; // Instagram pink
  }
  if (urlLower.includes("facebook.com")) {
    return { name: "Facebook", icon: LucideFacebook, color: "#1877F2" }; // Facebook blue
  }
  if (urlLower.includes("onlyfans.com")) {
    return { name: "OnlyFans", icon: LucideVideo, color: "#00AFF0" }; // OnlyFans cyan
  }

  // Entertainment Databases
  if (urlLower.includes("imdb.com")) {
    return { name: "IMDb", icon: LucideFilm, color: "#F5C518" }; // IMDb yellow
  }

  // Adult Industry Databases
  if (urlLower.includes("iafd.com")) {
    return { name: "IAFD", icon: LucideDatabase, color: "#9B59B6" }; // Purple
  }
  if (urlLower.includes("adultfilmdatabase.com")) {
    return { name: "AFDB", icon: LucideDatabase, color: "#16A085" }; // Teal
  }
  if (urlLower.includes("freeones.com")) {
    return { name: "FreeOnes", icon: LucideDatabase, color: "#E67E22" }; // Orange
  }
  if (urlLower.includes("babepedia.com")) {
    return { name: "Babepedia", icon: LucideDatabase, color: "#E91E63" }; // Pink
  }
  if (urlLower.includes("data18.com")) {
    return { name: "Data18", icon: LucideDatabase, color: "#27AE60" }; // Green
  }
  if (urlLower.includes("indexxx.com")) {
    return { name: "Indexxx", icon: LucideDatabase, color: "#8E44AD" }; // Violet
  }
  if (urlLower.includes("thenude.com")) {
    return { name: "The Nude", icon: LucideDatabase, color: "#1ABC9C" }; // Aqua
  }
  if (urlLower.includes("pornteengirl.com")) {
    return { name: "PornTeenGirl", icon: LucideGlobe, color: "#2ECC71" }; // Lime
  }

  // Unknown site - extract domain with neutral color
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return { name: domain, icon: LucideLink, color: "#95A5A6" }; // Gray
  } catch {
    return { name: "Link", icon: LucideLink, color: "#95A5A6" };
  }
};

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
            <EntityGrid
              entityType="gallery"
              filters={{
                gallery_filter: {
                  performers: {
                    value: [parseInt(performerId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              emptyMessage={`No galleries found for ${performer.name}`}
            />
          )}

          {activeTab === 'images' && (
            <EntityGrid
              entityType="image"
              filters={{
                image_filter: {
                  performers: {
                    value: [parseInt(performerId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
              emptyMessage={`No images found for ${performer.name}`}
            />
          )}

          {activeTab === 'groups' && (
            <EntityGrid
              entityType="group"
              filters={{
                group_filter: {
                  performers: {
                    value: [parseInt(performerId, 10)],
                    modifier: "INCLUDES",
                  },
                },
              }}
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

// Reusable component for external link with icon
const SectionLink = ({ url }) => {
  if (!url) return null;

  const { name, icon: Icon, color } = getSiteInfo(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80"
      style={{
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <Icon size={16} style={{ color }} />
      <span>{name}</span>
    </a>
  );
};

const PerformerDetails = ({ performer }) => {
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
            value={performer?.height_cm && `${performer.height_cm} cm`}
          />
          <DetailField
            label="Weight"
            value={performer?.weight && `${performer.weight} kg`}
          />
          <DetailField label="Measurements" value={performer?.measurements} />
          <DetailField label="Fake Tits" value={performer?.fake_tits} />
          <DetailField
            label="Penis Length"
            value={performer?.penis_length && `${performer.penis_length} cm`}
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

const PerformerStats = ({ performer, performerId }) => {
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
          valueColor="var(--text-secondary)"
          onClick={() => handleTabSwitch('galleries')}
          isActive={activeTab === 'galleries'}
        />
        <StatField
          label="Images:"
          value={performer?.image_count || 0}
          valueColor="var(--text-secondary)"
          onClick={() => handleTabSwitch('images')}
          isActive={activeTab === 'images'}
        />
        <StatField
          label="Collections:"
          value={performer?.group_count || 0}
          valueColor="var(--text-secondary)"
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

const getPerformer = async (id) => {
  return await libraryApi.findPerformerById(id);
};

export default PerformerDetail;
