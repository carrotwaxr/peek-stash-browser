import type { StashId } from "@peek/shared-types";
import DetailCard from "./DetailCard";

interface Props {
  /** The box's path for the entity type ("performers", "studios") */
  boxPath: "performers" | "studios";
  stashIds: readonly StashId[];
}

/**
 * The StashDB Links card: each stash id the entity has, linked to its page
 * on its stash-box (the endpoint without `/graphql`); nothing without one.
 */
const StashIdLinks = ({ boxPath, stashIds }: Props) => {
  if (stashIds.length === 0) return null;
  return (
    <DetailCard title="StashDB Links">
      <div className="space-y-2">
        {stashIds.map(({ endpoint, stash_id }) => (
          <a
            key={`${endpoint}:${stash_id}`}
            href={`${endpoint.replace("/graphql", "")}/${boxPath}/${stash_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm hover:underline transition-colors"
            style={{ color: "var(--accent-primary)" }}
          >
            {endpoint.includes("stashdb.org") ? "StashDB" : "External"}:{" "}
            {stash_id.substring(0, 8)}...
          </a>
        ))}
      </div>
    </DetailCard>
  );
};

export default StashIdLinks;
