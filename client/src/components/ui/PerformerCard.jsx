import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { LucideVenus, LucideMars, LucideUser } from "lucide-react";
import RatingControls from "./RatingControls.jsx";
import OCounterButton from "./OCounterButton.jsx";
import { getInitials, truncateText } from "../../utils/format.js";

const PerformerGenderIcon = ({ gender, size = 16 }) => {
  if (gender === "FEMALE") {
    return <LucideVenus size={size} color="#ff0080" />;
  } else if (gender === "MALE") {
    return <LucideMars size={size} color="#0561fa" />;
  } else {
    return <LucideUser size={size} color="#6c757d" />;
  }
};

const PerformerCard = forwardRef(
  (
    { performer, tabIndex, className = "", isTVMode = false, referrerUrl },
    ref
  ) => {
    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/performer/${performer.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`performer-card block rounded-lg border p-4 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Performer: ${performer.name}`}
      >
        <div className="text-center">
          {/* Image */}
          <div className="w-full aspect-[2/3] rounded mb-3 overflow-hidden">
            {performer.image_path ? (
              <img
                src={performer.image_path}
                alt={performer.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-lg font-semibold"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                {getInitials(performer.name)}
              </div>
            )}
          </div>

          {/* Name with Gender Icon */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <h3
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
              title={performer.name}
            >
              {truncateText(performer.name, 20)}
            </h3>
            <PerformerGenderIcon gender={performer.gender} size={16} />
          </div>

          {/* Scene Count */}
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            {performer.scene_count || 0} scene
            {performer.scene_count !== 1 ? "s" : ""}
          </div>

          {/* Status Icons */}
          <div
            className="flex flex-wrap items-center justify-center gap-2 text-xs mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              <span style={{ color: "var(--status-success)" }}>▶</span>{" "}
              {performer.play_count || 0}
            </span>
            <OCounterButton
              initialCount={performer.o_counter || 0}
              readOnly={true}
              className="text-xs"
            />
          </div>

          {/* Rating and Favorite */}
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.preventDefault()}
          >
            <RatingControls
              entityType="performer"
              entityId={performer.id}
              initialRating={performer.rating}
              initialFavorite={performer.favorite || false}
              size={16}
            />
          </div>
        </div>
      </Link>
    );
  }
);

PerformerCard.displayName = "PerformerCard";

export default PerformerCard;
