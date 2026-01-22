import { useState, useEffect, useCallback } from "react";
import { getClips } from "../../services/api.js";
import ClipGrid from "./ClipGrid.jsx";

export default function ClipSearch() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showUngenerated, setShowUngenerated] = useState(false);
  const perPage = 24;

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getClips({
        page,
        perPage,
        isGenerated: !showUngenerated,
        sortBy: "stashCreatedAt",
        sortDir: "desc",
      });
      setClips(result.clips);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to fetch clips", err);
    } finally {
      setLoading(false);
    }
  }, [page, showUngenerated]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Clips</h1>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showUngenerated}
            onChange={(e) => {
              setShowUngenerated(e.target.checked);
              setPage(1);
            }}
            className="rounded border-slate-500"
          />
          Show clips without previews
        </label>
      </div>

      {/* Results count */}
      {!loading && (
        <div className="text-sm text-slate-400 mb-4">
          {total} clip{total !== 1 ? "s" : ""} found
        </div>
      )}

      {/* Grid */}
      <ClipGrid clips={clips} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-slate-700 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-slate-700 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
