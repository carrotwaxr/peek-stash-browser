import { cva } from "class-variance-authority";
import clsx from "clsx";

/**
 * Paper component variants using CVA
 */
const paperVariants = cva(
  "rounded-lg border", // base styles
  {
    variants: {
      padding: {
        none: "",
        sm: "p-3",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      padding: "none",
    },
  }
);

/**
 * Base Paper component - reusable card/surface container
 * Provides consistent bg-card styling with optional padding variants
 */
const Paper = ({ padding = "none", className, style, children, ...props }) => {
  return (
    <div
      className={clsx(paperVariants({ padding }), className)}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Paper.Title - Semantic heading component
 * Can be used inside Paper.Header or standalone in custom layouts
 */
Paper.Title = ({ children, className, style, ...props }) => (
  <h2
    className={clsx("text-xl font-semibold", className)}
    style={{ color: "var(--text-primary)", ...style }}
    {...props}
  >
    {children}
  </h2>
);

/**
 * Paper.Subtitle - Semantic subtitle component
 * Can be used inside Paper.Header or standalone in custom layouts
 */
Paper.Subtitle = ({ children, className, style, ...props }) => (
  <p
    className={clsx("text-sm", className)}
    style={{ color: "var(--text-secondary)", ...style }}
    {...props}
  >
    {children}
  </p>
);

/**
 * Paper.Header - Standard header section with border-bottom
 * Accepts title/subtitle props for convenience or custom children
 */
Paper.Header = ({ title, subtitle, children, className, style, ...props }) => (
  <div
    className={clsx("px-6 py-4 border-b", className)}
    style={{ borderColor: "var(--border-color)", ...style }}
    {...props}
  >
    {title && <Paper.Title>{title}</Paper.Title>}
    {subtitle && <Paper.Subtitle className="mt-1">{subtitle}</Paper.Subtitle>}
    {children}
  </div>
);

/**
 * Paper.Body - Content area with padding
 * Supports same padding variants as base Paper
 */
Paper.Body = ({ padding = "md", className, children, ...props }) => {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div className={clsx(paddingClasses[padding], className)} {...props}>
      {children}
    </div>
  );
};

/**
 * Paper.Footer - Footer section with border-top
 * Typically used for action buttons
 */
Paper.Footer = ({ className, style, children, ...props }) => (
  <div
    className={clsx("flex items-center justify-end space-x-3 px-6 py-4 border-t", className)}
    style={{ borderColor: "var(--border-color)", ...style }}
    {...props}
  >
    {children}
  </div>
);

export default Paper;
