// client/src/components/pages/UserStats/components/StatCard.tsx

import { type ReactNode } from "react";
import { Paper } from "../../../ui/index";

interface Props {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
}

/**
 * Simple stat display card
 */
const StatCard = ({ label, value, subtitle, icon }: Props) => (
  <Paper padding="md" className="text-center flex flex-col items-center gap-1">
    {icon && (
      <div style={{ color: "var(--text-muted)" }} className="mb-1">
        {icon}
      </div>
    )}
    <div
      style={{ color: "var(--text-primary)" }}
      className="text-2xl font-bold"
    >
      {value}
    </div>
    <div style={{ color: "var(--text-secondary)" }} className="text-sm">
      {label}
    </div>
    {subtitle && (
      <div style={{ color: "var(--text-muted)" }} className="text-xs">
        {subtitle}
      </div>
    )}
  </Paper>
);

export default StatCard;
