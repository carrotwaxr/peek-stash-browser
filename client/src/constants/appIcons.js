/**
 * Centralized application icon definitions (non-entity icons).
 * For entity icons (Scene, Performer, Studio, etc.), see entityIcons.js
 *
 * Usage:
 *   import { FEATURE_ICONS, ACTION_ICONS } from "../constants/appIcons.js";
 *
 *   // For ThemedIcon (string names)
 *   <ThemedIcon name={FEATURE_ICONS.watchHistory} />
 *
 *   // For direct Lucide imports
 *   import { APP_ICON_COMPONENTS } from "../constants/appIcons.js";
 *   const HistoryIcon = APP_ICON_COMPONENTS.watchHistory;
 */
import {
  // Feature/Page icons
  BarChart3,
  CircleHelp,
  CircleUserRound,
  History,
  Home,
  LogOut,
  Settings,
  Sparkles,
  Tv,

  // Action icons
  Check,
  Copy,
  Droplets,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  Pencil,
  Play,
  Pause,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  X,

  // Navigation/Arrow icons
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,

  // View mode icons
  Calendar,
  Folder,
  FolderOpen,
  Grid2x2,
  List,
  Network,
  Square,

  // UI icons
  AlertCircle,
  Filter,
  ImageOff,
  Info,
  Loader2,
  Menu,
  MoreVertical,
  Search,

  // Server stats icons
  Clock,
  Cpu,
  Database,
  HardDrive,

  // Gender icons
  Mars,
  Venus,

  // Brand icons
  Eye as EyeLogo,
} from "lucide-react";

/**
 * Feature/Page icon names (for ThemedIcon)
 */
export const FEATURE_ICONS = {
  watchHistory: "history",
  userStats: "bar-chart-3",
  settings: "settings",
  help: "circle-help",
  questionCircle: "circle-help", // Alias
  tvMode: "tv",
  logout: "log-out",
  userMenu: "circle-user-round",
  recommended: "sparkles",
  home: "home",
};

/**
 * Action icon names (for ThemedIcon)
 */
export const ACTION_ICONS = {
  favorite: "heart",
  rating: "star",
  oCounter: "droplets",
  play: "play",
  pause: "pause",
  delete: "trash-2",
  edit: "pencil",
  copy: "copy",
  close: "x",
  add: "plus",
  hide: "eye-off",
  show: "eye",
  view: "eye",
  externalLink: "external-link",
  refresh: "refresh-cw",
  undo: "rotate-ccw",
  check: "check",
};

/**
 * Navigation/Arrow icon names (for ThemedIcon)
 */
export const NAV_ICONS = {
  chevronUp: "chevron-up",
  chevronDown: "chevron-down",
  chevronLeft: "chevron-left",
  chevronRight: "chevron-right",
  arrowUp: "arrow-up",
  arrowDown: "arrow-down",
  arrowLeft: "arrow-left",
  sort: "arrow-up-down",
};

/**
 * View mode icon names (for ThemedIcon)
 */
export const VIEW_MODE_ICONS = {
  grid: "grid-2x2",
  card: "square",
  tree: "network",
  list: "list",
  timeline: "calendar",
  folder: "folder-open",
  folderClosed: "folder",
};

/**
 * UI icon names (for ThemedIcon)
 */
export const UI_ICONS = {
  menu: "menu",
  moreOptions: "more-vertical",
  search: "search",
  filter: "filter",
  info: "info",
  alert: "alert-circle",
  loading: "loader-2",
  noImage: "image-off",
  checkbox: "square",
  checkboxChecked: "check-square",
  fullscreen: "maximize",
  exitFullscreen: "minimize",
  tools: "wrench",
};

/**
 * Server stats icon names
 */
export const SERVER_ICONS = {
  uptime: "clock",
  cpu: "cpu",
  database: "database",
  storage: "hard-drive",
};

/**
 * Gender icon names
 */
export const GENDER_ICONS = {
  male: "mars",
  female: "venus",
  unknown: "user",
};

/**
 * Brand icon names
 */
export const BRAND_ICONS = {
  logo: "eye",
  peek: "eye-off",
};

/**
 * Direct Lucide component references for when you need the actual component.
 * Use these when you're not using ThemedIcon.
 */
export const APP_ICON_COMPONENTS = {
  // Feature/Page
  watchHistory: History,
  userStats: BarChart3,
  settings: Settings,
  help: CircleHelp,
  questionCircle: CircleHelp,
  tvMode: Tv,
  logout: LogOut,
  userMenu: CircleUserRound,
  recommended: Sparkles,
  home: Home,

  // Actions
  favorite: Heart,
  rating: Star,
  oCounter: Droplets,
  play: Play,
  pause: Pause,
  delete: Trash2,
  edit: Pencil,
  copy: Copy,
  close: X,
  add: Plus,
  hide: EyeOff,
  show: Eye,
  view: Eye,
  externalLink: ExternalLink,
  refresh: RefreshCw,
  undo: RotateCcw,
  check: Check,

  // Navigation
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  sort: ArrowUpDown,

  // View modes
  grid: Grid2x2,
  card: Square,
  tree: Network,
  list: List,
  timeline: Calendar,
  folder: FolderOpen,
  folderClosed: Folder,

  // UI
  menu: Menu,
  moreOptions: MoreVertical,
  search: Search,
  filter: Filter,
  info: Info,
  alert: AlertCircle,
  loading: Loader2,
  noImage: ImageOff,

  // Server stats
  uptime: Clock,
  cpu: Cpu,
  database: Database,
  storage: HardDrive,

  // Gender
  male: Mars,
  female: Venus,

  // Brand
  logo: EyeLogo,
};

/**
 * Get icon name by key
 */
export const getAppIconName = (key) => {
  return (
    FEATURE_ICONS[key] ||
    ACTION_ICONS[key] ||
    NAV_ICONS[key] ||
    VIEW_MODE_ICONS[key] ||
    UI_ICONS[key] ||
    SERVER_ICONS[key] ||
    GENDER_ICONS[key] ||
    BRAND_ICONS[key] ||
    key
  );
};

/**
 * Get icon component by key
 */
export const getAppIconComponent = (key) => {
  return APP_ICON_COMPONENTS[key] || null;
};
