import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, ErrorMessage, LoadingSpinner } from "../ui/index.js";
import { truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";

const Studios = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    // Initial fetch with default parameters
    const query = {
      filter: {
        direction: "DESC",
        page: 1,
        per_page: 24,
        q: "",
        sort: "scenes_count",
      },
    };

    const fetchInitialData = async () => {
      // Don't make API calls if not authenticated or still checking auth
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(query);
        setError(null);
        const result = await getStudios(query);
        setData(result);
      } catch (err) {
        console.error("getStudios error:", err);
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isAuthLoading, isAuthenticated]);

  const handleQueryChange = async (newQuery) => {
    // Don't make API calls if not authenticated or still checking auth
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    // Avoid duplicate queries
    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      const result = await getStudios(newQuery);
      setData(result);
    } catch (err) {
      console.error("getStudios error:", err);
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const currentStudios = data?.studios || [];
  const totalCount = data?.count || 0;
  const perPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / perPage);

  if (error) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <PageHeader title="Studios" />
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
      <PageHeader
        title="Studios"
        subtitle="Browse studios and production companies"
      />

      {/* Controls Section */}
      <SearchControls
        artifactType="studio"
        initialSort="scenes_count"
        onQueryChange={handleQueryChange}
        totalPages={totalPages}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentStudios.map((studio) => (
              <StudioCard key={studio.id} studio={studio} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const StudioCard = ({ studio }) => {
  return (
    <Link
      to={`/studio/${studio.id}`}
      className="block rounded-lg border p-6 hover:shadow-lg transition-shadow cursor-pointer"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-start space-x-4">
        {studio.image_path ? (
          <img
            src={studio.image_path}
            alt={studio.name}
            className="w-16 h-16 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            🏢
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={studio.name}
          >
            {truncateText(studio.name, 30)}
          </h3>

          {studio.scene_count > 0 && (
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {studio.scene_count} scene{studio.scene_count !== 1 ? "s" : ""}
            </p>
          )}

          {studio.url && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.url, 40)}
            </p>
          )}

          {studio.details && (
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.details, 80)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
};

const getStudios = async (query) => {
  console.log("Fetching Studios with query:", query);
  const response = await libraryApi.findStudios(query);

  // Extract studios and count from server response structure
  const findStudios = response?.findStudios;
  const result = {
    studios: findStudios?.studios || [],
    count: findStudios?.count || 0,
  };
  console.log("Got Studios:", result);
  return result;
};

export default Studios;
