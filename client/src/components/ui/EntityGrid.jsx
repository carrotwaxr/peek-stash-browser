import { forwardRef, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { galleryTitle } from "../../utils/gallery.js";
import { libraryApi } from "../../services/api.js";
import EmptyState from "./EmptyState.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { GridCard } from "./GridCard.jsx";
import PerformerCard from "./PerformerCard.jsx";
import Pagination from "./Pagination.jsx";

/**
 * EntityGrid - Generic grid component for displaying entities (galleries, images, groups, etc.)
 *
 * @param {Object} props
 * @param {'gallery'|'group'|'performer'|'studio'|'tag'|'image'} props.entityType - Type of entity
 * @param {Object} [props.filters] - Filters to apply to the query
 * @param {string} [props.emptyMessage] - Message to display when no results
 */
const EntityGrid = ({ entityType, filters, emptyMessage }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Pagination from URL
  const currentPage = parseInt(searchParams.get('page')) || 1;
  const perPage = 24;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        let result;
        const queryParams = {
          filter: {
            page: currentPage,
            per_page: perPage,
          },
          ...filters,
        };

        switch (entityType) {
          case 'gallery':
            result = await libraryApi.findGalleries(queryParams);
            setData(result.galleries || []);
            setTotalCount(result.count || 0);
            break;
          case 'group':
            result = await libraryApi.findGroups(queryParams);
            setData(result.groups || []);
            setTotalCount(result.count || 0);
            break;
          case 'performer':
            result = await libraryApi.findPerformers(queryParams);
            setData(result.performers || []);
            setTotalCount(result.count || 0);
            break;
          case 'studio':
            result = await libraryApi.findStudios(queryParams);
            setData(result.studios || []);
            setTotalCount(result.count || 0);
            break;
          case 'tag':
            result = await libraryApi.findTags(queryParams);
            setData(result.tags || []);
            setTotalCount(result.count || 0);
            break;
          case 'image':
            result = await libraryApi.findImages(queryParams);
            setData(result.images || []);
            setTotalCount(result.count || 0);
            break;
          default:
            console.error(`Unknown entity type: ${entityType}`);
        }
      } catch (error) {
        console.error(`Error fetching ${entityType}s:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [entityType, currentPage, filters]);

  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    if (newPage === 1) {
      newParams.delete('page');
    } else {
      newParams.set('page', newPage.toString());
    }
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        message={emptyMessage || `No ${entityType}s found`}
        icon="📦"
      />
    );
  }

  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <>
      <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
        {data.map((item) => {
          if (entityType === 'performer') {
            return (
              <PerformerCard
                key={item.id}
                performer={item}
                tabIndex={-1}
              />
            );
          }

          return <EntityCard key={item.id} entity={item} entityType={entityType} />;
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </>
  );
};

// Card component for non-performer entities
const EntityCard = forwardRef(({ entity, entityType, ...others }, ref) => {
  let imagePath, title, subtitle, indicators, linkTo, description;

  switch (entityType) {
    case 'gallery':
      imagePath = entity.paths?.cover || null;
      title = galleryTitle(entity);
      description = entity.description;
      const galleryDate = entity.date
        ? new Date(entity.date).toLocaleDateString()
        : null;
      subtitle = (() => {
        if (entity.studio && galleryDate) {
          return `${entity.studio.name} • ${galleryDate}`;
        } else if (entity.studio) {
          return entity.studio.name;
        } else if (galleryDate) {
          return galleryDate;
        }
        return null;
      })();
      indicators = [
        {
          type: "IMAGES",
          count: entity.image_count,
          tooltipContent:
            entity.image_count === 1
              ? "1 Image"
              : `${entity.image_count} Images`,
        },
      ];
      linkTo = `/gallery/${entity.id}`;
      break;

    case 'group':
      imagePath = entity.front_image_path || entity.back_image_path;
      title = entity.name;
      description = entity.description;
      subtitle = (() => {
        if (entity.studio && entity.date) {
          return `${entity.studio.name} • ${entity.date}`;
        } else if (entity.studio) {
          return entity.studio.name;
        } else if (entity.date) {
          return entity.date;
        }
        return null;
      })();
      indicators = [
        { type: "SCENES", count: entity.scene_count },
        { type: "GROUPS", count: entity.sub_group_count },
      ];
      linkTo = `/collection/${entity.id}`;
      break;

    case 'studio':
      imagePath = entity.image_path;
      title = entity.name;
      description = entity.details;
      indicators = [
        { type: "SCENES", count: entity.scene_count },
      ];
      linkTo = `/studio/${entity.id}`;
      break;

    case 'tag':
      imagePath = entity.image_path;
      title = entity.name;
      description = entity.description;
      indicators = [
        { type: "SCENES", count: entity.scene_count },
      ];
      linkTo = `/tags/${entity.id}`;
      break;

    case 'image':
      imagePath = entity.paths?.thumbnail || entity.paths?.image;
      title = entity.title || `Image ${entity.id}`;
      description = null;
      subtitle = null;
      indicators = [];
      linkTo = `/image/${entity.id}`;
      break;

    default:
      return null;
  }

  return (
    <GridCard
      description={description}
      entityType={entityType}
      imagePath={imagePath}
      indicators={indicators}
      linkTo={linkTo}
      maxTitleLines={2}
      ratingControlsProps={{
        entityId: entity.id,
        initialRating: entity.rating100 || entity.rating,
        initialFavorite: entity.favorite || false,
        initialOCounter: entity.o_counter,
      }}
      ref={ref}
      subtitle={subtitle}
      tabIndex={-1}
      title={title}
      {...others}
    />
  );
});

EntityCard.displayName = 'EntityCard';

export default EntityGrid;
