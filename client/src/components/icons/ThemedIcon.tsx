import {
  ArrowUpDown,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CircleUserRound,
  Clapperboard,
  Download,
  Eye,
  EyeOff,
  Film,
  Filter,
  GalleryVertical,
  Heart,
  History,
  Home,
  Image,
  Images,
  Info,
  List,
  ListPlus,
  LogOut,
  type LucideIcon,
  Menu,
  Pause,
  Pencil,
  Play,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  Tv,
  User,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { getIconName } from "../../themes/icons/iconSets";
import { useTheme } from "../../themes/useTheme";

/**
 * Every icon name ThemedIcon can draw, by its kebab-case Lucide name (the
 * name the theme's icon set resolves a key to). Named imports keep the rest of
 * Lucide's 1,500 icons out of the first load. A new name used anywhere in the
 * app (constants/appIcons.ts, constants/entityIcons.ts, constants/navigation.ts
 * or a literal <ThemedIcon name>) needs an entry here:
 * tests/components/icons/ThemedIcon.test.tsx fails for a missing one.
 */
const THEMED_ICONS = {
  "arrow-up-down": ArrowUpDown,
  "bar-chart-3": BarChart3,
  "building-2": Building2,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-help": CircleHelp,
  "circle-user-round": CircleUserRound,
  clapperboard: Clapperboard,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  film: Film,
  filter: Filter,
  "gallery-vertical": GalleryVertical,
  heart: Heart,
  history: History,
  home: Home,
  image: Image,
  images: Images,
  info: Info,
  list: List,
  "list-plus": ListPlus,
  "log-out": LogOut,
  menu: Menu,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  scissors: Scissors,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  tag: Tag,
  "trash-2": Trash2,
  tv: Tv,
  user: User,
  video: Video,
  wrench: Wrench,
  x: X,
} satisfies Record<string, LucideIcon>;

type ThemedIconName = keyof typeof THEMED_ICONS;

const isThemedIconName = (name: string): name is ThemedIconName =>
  Object.prototype.hasOwnProperty.call(THEMED_ICONS, name);

// Theme-aware icon component that automatically uses the right icon for the current theme
interface ThemedIconProps {
  name: string;
  size?: number;
  className?: string;
  color?: string;
  [key: string]: unknown;
}

export const ThemedIcon = ({
  name,
  size = 20,
  className = "",
  color = "currentColor",
  ...props
}: ThemedIconProps) => {
  const { currentTheme } = useTheme();
  const iconName = getIconName(name, currentTheme);

  if (!isThemedIconName(iconName)) {
    return null;
  }

  const Icon = THEMED_ICONS[iconName];

  return <Icon size={size} color={color} className={className} {...props} />;
};
