import type { Dictionary } from "@/lib/i18n";

export type UserRole = "admin" | "manager" | "cashier" | "staff" | "barista";

export type NavKey = keyof Dictionary["nav"]["short"];

export interface NavItem {
  href: string;
  key: NavKey;
  iconName:
    | "LayoutDashboard"
    | "ShoppingBag"
    | "Coffee"
    | "Wallet"
    | "BookOpen"
    | "PackagePlus"
    | "ClipboardCheck"
    | "Receipt"
    | "BarChart3"
    | "Settings";
  roles: UserRole[];
  mobilePrimary?: boolean;
}

export const ROLE_STYLE: Record<
  UserRole,
  { badgeClass: string; defaultRoute: string }
> = {
  admin: {
    badgeClass: "bg-amber-900/15 text-amber-900 border-amber-900/25",
    defaultRoute: "/",
  },
  manager: {
    badgeClass: "bg-emerald-700/15 text-emerald-800 border-emerald-700/25",
    defaultRoute: "/",
  },
  cashier: {
    badgeClass: "bg-sky-700/15 text-sky-800 border-sky-700/25",
    defaultRoute: "/pos",
  },
  staff: {
    badgeClass: "bg-violet-700/15 text-violet-800 border-violet-700/25",
    defaultRoute: "/pos",
  },
  barista: {
    badgeClass: "bg-orange-700/15 text-orange-800 border-orange-700/25",
    defaultRoute: "/bar",
  },
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    key: "dashboard",
    iconName: "LayoutDashboard",
    roles: ["admin", "manager"],
    mobilePrimary: true,
  },
  {
    href: "/pos",
    key: "pos",
    iconName: "ShoppingBag",
    roles: ["admin", "manager", "cashier", "staff"],
    mobilePrimary: true,
  },
  {
    href: "/bar",
    key: "bar",
    iconName: "Coffee",
    roles: ["admin", "manager", "cashier", "staff", "barista"],
    mobilePrimary: true,
  },
  {
    href: "/shifts",
    key: "shifts",
    iconName: "Wallet",
    roles: ["admin", "manager", "cashier"],
    mobilePrimary: true,
  },
  {
    href: "/menu",
    key: "menu",
    iconName: "BookOpen",
    roles: ["admin", "manager", "barista"],
  },
  {
    href: "/inventory",
    key: "inventory",
    iconName: "PackagePlus",
    roles: ["admin", "manager"],
  },
  {
    href: "/stock-take",
    key: "stockTake",
    iconName: "ClipboardCheck",
    roles: ["admin", "manager"],
  },
  {
    href: "/expenses",
    key: "expenses",
    iconName: "Receipt",
    roles: ["admin", "manager", "cashier"],
  },
  {
    href: "/reports",
    key: "reports",
    iconName: "BarChart3",
    roles: ["admin", "manager"],
  },
  {
    href: "/settings",
    key: "settings",
    iconName: "Settings",
    roles: ["admin"],
  },
];

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (pathname === "/login" || pathname === "/unauthorized") return true;
  const matched = NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );
  if (!matched) return true;
  return matched.roles.includes(role);
}
