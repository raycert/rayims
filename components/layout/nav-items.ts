import {
  Building2,
  FolderKanban,
  LayoutDashboard,
  Library,
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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/clients", label: "Clients", icon: Building2, enabled: false },
  { href: "/projects", label: "Projects", icon: FolderKanban, enabled: false },
  { href: "/frameworks", label: "Frameworks", icon: Library, enabled: false },
];
