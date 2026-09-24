import type { CSSProperties, ReactNode } from "react";

/**
 * Brand icons for external site links. lucide-react deprecated its brand
 * icons, so these are its twitter, instagram and facebook drawings as plain
 * SVGs, with the same attributes a lucide icon renders (24-unit box, 2px
 * round stroke in the given color, hidden from screen readers).
 */
interface Props {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

const BrandIcon = ({
  name,
  size = 24,
  color = "currentColor",
  className,
  style,
  children,
}: Props & { name: string; children: ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={["lucide", `lucide-${name}`, className]
      .filter(Boolean)
      .join(" ")}
    aria-hidden="true"
    style={style}
  >
    {children}
  </svg>
);

export const TwitterIcon = (props: Props) => (
  <BrandIcon name="twitter" {...props}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </BrandIcon>
);

export const InstagramIcon = (props: Props) => (
  <BrandIcon name="instagram" {...props}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </BrandIcon>
);

export const FacebookIcon = (props: Props) => (
  <BrandIcon name="facebook" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </BrandIcon>
);
