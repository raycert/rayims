import {
  Building2,
  FolderKanban,
  House,
  Library,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false = route not built yet (shown disabled, never linked). */
  enabled: boolean;
};

/** Only routes that exist are enabled. Later phases flip these on. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House, enabled: true },
  { href: "/clients", label: "Clients", icon: Building2, enabled: true },
  { href: "/projects", label: "Projects", icon: FolderKanban, enabled: true },
  { href: "/frameworks", label: "Frameworks", icon: Library, enabled: true },
  { href: "/activity-types", label: "Activity Types", icon: Tags, enabled: true },
];
