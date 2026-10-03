/**
 * The metallic medal a rating wears (RatingBadge, the tag tree's pill):
 * bronze under 3.5, silver under 7, gold from 7, on the 0 to 10 scale. The
 * medals are fixed colours (like the status colours) with text that keeps
 * 4.5:1 on every stop of the gradient.
 */
export interface RatingMedal {
  background: string;
  boxShadow: string;
  border: string;
  color: string;
}

export function ratingMedal(rating100: number): RatingMedal {
  const value = rating100 / 10;
  if (value < 3.5) {
    // Bronze: warm metallic with highlights and shadows
    return {
      background:
        "linear-gradient(135deg, #A8652B 0%, #8B4F1F 30%, #A8652B 50%, #7A4219 70%, #8B4F1F 100%)",
      boxShadow:
        "inset 0 1px 3px rgba(255, 200, 150, 0.6), inset 0 -1px 2px rgba(80, 40, 20, 0.8), 0 3px 6px rgba(0, 0, 0, 0.4)",
      border: "1px solid rgba(139, 69, 19, 0.5)",
      color: "#ffffff",
    };
  }
  if (value < 7.0) {
    // Silver: cool metallic with bright highlights
    return {
      background:
        "linear-gradient(135deg, #F2F2F2 0%, #C4C4C4 30%, #E0E0E0 50%, #B0B0B0 70%, #D0D0D0 100%)",
      boxShadow:
        "inset 0 1px 3px rgba(255, 255, 255, 0.8), inset 0 -1px 2px rgba(100, 100, 100, 0.6), 0 3px 6px rgba(0, 0, 0, 0.4)",
      border: "1px solid rgba(144, 144, 144, 0.5)",
      color: "#1a1a1a",
    };
  }
  // Gold: rich metallic with warm highlights
  return {
    background:
      "linear-gradient(135deg, #FFE87C 0%, #D4AF37 30%, #FFD700 50%, #B8860B 70%, #DAA520 100%)",
    boxShadow:
      "inset 0 1px 3px rgba(255, 250, 200, 0.9), inset 0 -1px 2px rgba(150, 100, 0, 0.6), 0 3px 6px rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(184, 134, 11, 0.5)",
    color: "#1a1a1a",
  };
}
