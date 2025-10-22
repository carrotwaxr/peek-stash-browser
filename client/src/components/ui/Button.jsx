import { cva } from "class-variance-authority";
import { clsx } from "clsx";

const buttonVariants = cva(
  // Base styles for all buttons
  "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "text-white hover:opacity-90",
        secondary: "border hover:opacity-80",
        tertiary: "border border-transparent hover:opacity-80",
        destructive: "text-white hover:opacity-90",
      },
      size: {
        sm: "px-2 py-1.5 text-sm gap-1.5",
        md: "px-4 py-2 text-base gap-2",
        lg: "px-6 py-3 text-lg gap-2.5",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

/**
 * Button component with consistent styling and behavior
 *
 * @param {Object} props
 * @param {'primary'|'secondary'|'tertiary'|'destructive'} props.variant - Button style variant
 * @param {'sm'|'md'|'lg'} props.size - Button size
 * @param {React.ReactNode} props.icon - Icon element to display
 * @param {'left'|'right'} props.iconPosition - Position of icon relative to children
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.disabled - Disable button
 * @param {boolean} props.fullWidth - Make button full width
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Button content
 */
export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  fullWidth = false,
  className,
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  // Determine background color based on variant
  const getBackgroundColor = () => {
    switch (variant) {
      case "primary":
        return "var(--accent-primary)";
      case "secondary":
        return "var(--bg-secondary)";
      case "tertiary":
        return "transparent";
      case "destructive":
        return "var(--accent-error)";
      default:
        return "var(--bg-secondary)";
    }
  };

  // Determine text color based on variant
  const getTextColor = () => {
    switch (variant) {
      case "primary":
      case "destructive":
        return "white";
      case "secondary":
        return "var(--text-primary)";
      case "tertiary":
        return "var(--text-primary)";
      default:
        return "var(--text-primary)";
    }
  };

  // Determine border color based on variant
  const getBorderColor = () => {
    switch (variant) {
      case "primary":
        return "var(--accent-primary)";
      case "secondary":
        return "var(--border-color)";
      case "tertiary":
        return "var(--border-color)";
      case "destructive":
        return "var(--accent-error)";
      default:
        return "var(--border-color)";
    }
  };

  const styles = {
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    borderColor: getBorderColor(),
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <svg
      className="animate-spin"
      width={size === "sm" ? 14 : size === "lg" ? 18 : 16}
      height={size === "sm" ? 14 : size === "lg" ? 18 : 16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      className={clsx(buttonVariants({ variant, size, fullWidth }), className)}
      style={styles}
      disabled={isDisabled}
      {...props}
    >
      {loading && <LoadingSpinner />}
      {!loading && icon && iconPosition === "left" && icon}
      {children}
      {!loading && icon && iconPosition === "right" && icon}
    </button>
  );
}
