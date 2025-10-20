import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import { LucideMars, LucideStar, LucideUser, LucideVenus } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const PerformerDetail = () => {
  const { performerId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [performer, setPerformer] = useState(null);

  // Set page title to performer name
  usePageTitle(performer?.name || "Performer");

  useEffect(() => {
    const fetchPerformer = async () => {
      try {
        setIsLoading(true);
        const performerData = await getPerformer(performerId);
        setPerformer(performerData);
      } catch {
        // Error loading performer - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchPerformer();
  }, [performerId]);

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
        <div className="mb-6">
          <Link
            to="/performers"
            className="inline-flex items-center px-3 py-2 rounded-md text-sm transition-colors"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              border: "1px solid",
            }}
          >
            ← Back to Performers
          </Link>
        </div>

        {/* Performer Header - Name and Icons (always at top) */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1
              className="text-4xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {performer.name}
            </h1>
            <PerformerGenderIcon gender={performer.gender} />
            {performer.favorite && <LucideStar color="#efdd03" />}
          </div>

          {performer?.alias_list?.length > 0 && (
            <p
              className="text-lg mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {performer.alias_list.join(", ")}
            </p>
          )}
        </div>

        {/* Two Column Layout - Image on left, content on right (md+) */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Left Column: Performer Image */}
          <div className="w-full md:w-80 flex-shrink-0">
            <PerformerImage performer={performer} />
          </div>

          {/* Right Column: Stats and Details */}
          <div className="flex-1 space-y-6">
            <PerformerStats performer={performer} />
            <PerformerDetails performer={performer} />
            <PerformerLinks performer={performer} />
          </div>
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <SceneSearch
            permanentFilters={{
              performers: { value: [performerId], modifier: "INCLUDES" },
            }}
            permanentFiltersMetadata={{
              performers: [{ id: performerId, name: performer.name }],
            }}
            title={`Scenes featuring ${performer.name}`}
          />
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
const StatField = ({ label, value, valueColor = "var(--text-primary)" }) => {
  if (!value && value !== 0) return null;

  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-medium" style={{ color: valueColor }}>
        {value}
      </span>
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
        borderColor: "var(--border-color)",
        border: "1px solid",
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

// Reusable component for section heading with link
const SectionLink = ({ label, url }) => {
  if (!url) return null;

  return (
    <div className="mb-4">
      <SectionHeader>{label}</SectionHeader>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-sm hover:underline"
        style={{ color: "var(--accent-primary)" }}
      >
        {url} ↗
      </a>
    </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <DetailField label="Tattoos" value={performer?.tattoos} />
        <DetailField label="Piercings" value={performer?.piercings} />
        <DetailField label="Disambiguation" value={performer?.disambiguation} />
      </div>
    </Card>
  );
};

const PerformerStats = ({ performer }) => {
  // Calculate O-Count percentage
  const oCountPercentage = performer?.scene_count && performer?.o_counter
    ? ((performer.o_counter / performer.scene_count) * 100).toFixed(1)
    : null;

  return (
    <Card title="Statistics">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatField label="Scenes:" value={performer?.scene_count || 0} />
        <StatField
          label="Rating:"
          value={
            performer?.rating100 && `${(performer.rating100 / 20).toFixed(1)}/5`
          }
          valueColor="var(--accent-primary)"
        />
        <StatField label="O Count:" value={performer?.o_counter} />
        <StatField
          label="O-Count %:"
          value={oCountPercentage && `${oCountPercentage}%`}
          valueColor="var(--accent-primary)"
        />
        <StatField label="Play Count:" value={performer?.play_count} />
      </div>
    </Card>
  );
};

const PerformerImage = ({ performer }) => {
  return (
    <div
      className="rounded-lg w-full md:w-80 aspect-[2/3] rounded-xl overflow-hidden shadow-lg p-0"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        border: "1px solid",
      }}
    >
      {performer?.image_path ? (
        <img
          src={performer.image_path}
          alt={performer.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
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
        </div>
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
          <div className="flex flex-wrap gap-3">
            {performer?.url && (
              <SectionLink href={performer.url} label="Website" />
            )}
            {performer?.twitter && (
              <SectionLink
                href={`https://twitter.com/${performer.twitter}`}
                label={`@${performer.twitter}`}
              />
            )}
            {performer?.instagram && (
              <SectionLink
                href={`https://instagram.com/${performer.instagram}`}
                label={`@${performer.instagram}`}
              />
            )}
            {performer?.urls?.map((url, idx) => (
              <SectionLink
                key={idx}
                href={url}
                label={url.length > 40 ? url.substring(0, 40) + "..." : url}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Tags Section */}
      {hasTags && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-2">
            {performer.tags.map((tag) => (
              <Link
                key={tag.id}
                to={`/tags/${tag.id}`}
                className="px-3 py-1 rounded-full text-sm transition-all duration-200 hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-primary)",
                }}
              >
                {tag.name}
              </Link>
            ))}
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

const PerformerGenderIcon = ({ gender }) => {
  if (gender === "FEMALE") {
    return <LucideVenus color="#ff0080" />;
  } else if (gender === "MALE") {
    return <LucideMars color="#0561fa" />;
  } else {
    return <LucideUser color="#6c757d" />;
  }
};

const getPerformer = async (id) => {
  return await libraryApi.findPerformerById(id);
};

export default PerformerDetail;
