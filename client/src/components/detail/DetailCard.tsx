import type { ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
}

/** One card of a detail page: bordered, with an optional title */
const DetailCard = ({ title, children }: Props) => (
  <div
    className="p-6 rounded-lg border"
    style={{
      backgroundColor: "var(--bg-card)",
      borderColor: "var(--border-color)",
    }}
  >
    {title && (
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
    )}
    {children}
  </div>
);

export default DetailCard;
