import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiGet, getErrorMessage } from "../../api";
import type { EntityMatch } from "../../api/lookupFailure";
import { useNavigationState } from "../../hooks/useNavigationState";
import { getEntityPath } from "../../utils/entityLinks";
import Button from "./Button";
import StatusMessage from "./StatusMessage";

/** The entity types with a detail page */
export type DetailEntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery";

const LABELS: Record<
  DetailEntityType,
  { singular: string; plural: string; listPath: string }
> = {
  scene: { singular: "Scene", plural: "scenes", listPath: "/scenes" },
  performer: {
    singular: "Performer",
    plural: "performers",
    listPath: "/performers",
  },
  studio: { singular: "Studio", plural: "studios", listPath: "/studios" },
  tag: { singular: "Tag", plural: "tags", listPath: "/tags" },
  group: {
    singular: "Collection",
    plural: "collections",
    listPath: "/collections",
  },
  gallery: { singular: "Gallery", plural: "galleries", listPath: "/galleries" },
};

interface Props {
  entityType: DetailEntityType;
  status: "notFound" | "ambiguous" | "error";
  /** Each server's entity with the id (ambiguous) */
  matches?: EntityMatch[];
  /** What went wrong (error) */
  error?: unknown;
  /** Asks again (error) */
  onRetry?: () => void;
}

interface StashInstancesResponse {
  availableInstances?: { id: string; name: string }[];
}

/**
 * Each enabled server's name by id, for telling matches apart. Empty until
 * the names load, and when they cannot: the links work without them.
 */
function useServerNames(): Map<string, string> {
  const [names, setNames] = useState(() => new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    apiGet<StashInstancesResponse>("/user/stash-instances", controller.signal)
      .then((data) => {
        setNames(
          new Map(
            (data.availableInstances ?? []).map((instance) => [
              instance.id,
              instance.name,
            ])
          )
        );
      })
      // Aborted on unmount, or no names: the instance ids stand in
      .catch(() => {});
    return () => {
      controller.abort();
    };
  }, []);

  return names;
}

interface MatchListProps {
  entityType: DetailEntityType;
  matches: EntityMatch[];
}

const MatchList = ({ entityType, matches }: MatchListProps) => {
  const serverNames = useServerNames();
  const { singular } = LABELS[entityType];

  return (
    <ul
      className="w-full max-w-md rounded-lg border divide-y text-left"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {matches.map((match) => (
        <li
          key={match.instanceId}
          className="flex items-center justify-between gap-4 px-4 py-3"
          style={{ borderColor: "var(--border-color)" }}
        >
          <Link
            to={getEntityPath(entityType, match, true)}
            className="font-medium hover:underline"
            style={{ color: "var(--accent-primary)" }}
          >
            {match.name ?? match.title ?? `${singular} ${match.id}`}
          </Link>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {serverNames.get(match.instanceId) ?? match.instanceId}
          </span>
        </li>
      ))}
    </ul>
  );
};

/**
 * What a detail page shows when its entity is not there to show: not found
 * (missing, hidden or restricted look the same), found on several servers
 * (a link to each), or an error with Retry. Each offers a way back: the
 * Back button, and a link to the type's list page.
 */
const EntityNotFound = ({
  entityType,
  status,
  matches = [],
  error,
  onRetry,
}: Props) => {
  const { goBack, backButtonText } = useNavigationState();
  const { singular, plural, listPath } = LABELS[entityType];
  const noun = singular.toLowerCase();

  const heading =
    status === "notFound"
      ? `${singular} not found`
      : status === "ambiguous"
        ? `${singular} found on several servers`
        : `Could not load this ${noun}`;

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="mt-6 mb-6">
        <Button
          onClick={goBack}
          variant="secondary"
          icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
          title={backButtonText}
        >
          <span className="hidden sm:inline">{backButtonText}</span>
        </Button>
      </div>

      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {heading}
        </h1>

        {status === "notFound" && (
          <p style={{ color: "var(--text-muted)" }}>
            This {noun} does not exist, or it is not available to you.
          </p>
        )}

        {status === "ambiguous" && (
          <>
            <p style={{ color: "var(--text-muted)" }}>
              This link matches a {noun} on more than one server. Pick the one
              you meant.
            </p>
            <MatchList entityType={entityType} matches={matches} />
          </>
        )}

        {status === "error" && (
          <StatusMessage
            variant="error"
            className="w-full max-w-xl text-left"
            message={getErrorMessage(error)}
            onRetry={onRetry}
          />
        )}

        <Link to={listPath} className="btn btn-primary">
          Browse {plural}
        </Link>
      </div>
    </div>
  );
};

export default EntityNotFound;
