import type { Dictionary } from "@/lib/i18n";

export type UserRole =
  | "developer"
  | "admin"
  | "manager"
  | "cashier"
  | "staff"
  | "barista";

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
  iconGradient: string;
  roles: UserRole[];
  mobilePrimary?: boolean;
}

export const ROLE_ORDER: Record<UserRole, number> = {
  developer: 0,
  admin: 1,
  manager: 2,
  cashier: 3,
  barista: 4,
  staff: 5,
};

export const ROLE_STYLE: Record<
  UserRole,
  { badgeClass: string; defaultRoute: string }
> = {
  developer: {
    badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
    defaultRoute: "/",
  },
  admin: {
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    defaultRoute: "/",
  },
  manager: {
    badgeClass: "bg-teal-100 text-teal-900 border-teal-300",
    defaultRoute: "/",
  },
  cashier: {
    badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
    defaultRoute: "/pos",
  },
  staff: {
    badgeClass: "bg-lime-100 text-lime-900 border-lime-300",
    defaultRoute: "/pos",
  },
  barista: {
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    defaultRoute: "/bar",
  },
};

export function isHighAdminRole(role: UserRole): boolean {
  return role === "developer" || role === "admin";
}

export function assignableRolesFor(actorRole: UserRole): UserRole[] {
  if (actorRole === "developer") {
    return ["admin", "manager", "cashier", "barista", "staff"];
  }
  if (actorRole === "admin") {
    return ["manager", "cashier", "barista", "staff"];
  }
  return [];
}

export function canManageUser(
  actorRole: UserRole,
  actorId: string,
  target: { id: string; role: UserRole }
): boolean {
  if (target.id === actorId) return false;
  if (target.role === "developer") return false;
  if (actorRole === "developer") return true;
  if (actorRole === "admin") return target.role !== "admin";
  return false;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    key: "dashboard",
    iconName: "LayoutDashboard",
    iconGradient: "from-emerald-400 to-green-600",
    roles: ["developer", "admin", "manager"],
    mobilePrimary: true,
  },
  {
    href: "/pos",
    key: "pos",
    iconName: "ShoppingBag",
    iconGradient: "from-lime-400 to-emerald-600",
    roles: ["developer", "admin", "manager", "cashier", "staff"],
    mobilePrimary: true,
  },
  {
    href: "/bar",
    key: "bar",
    iconName: "Coffee",
    iconGradient: "from-amber-400 to-orange-500",
    roles: ["developer", "admin", "manager", "cashier", "staff", "barista"],
    mobilePrimary: true,
  },
  {
    href: "/shifts",
    key: "shifts",
    iconName: "Wallet",
    iconGradient: "from-teal-400 to-cyan-600",
    roles: ["developer", "admin", "manager", "cashier"],
    mobilePrimary: true,
  },
  {
    href: "/menu",
    key: "menu",
    iconName: "BookOpen",
    iconGradient: "from-rose-400 to-pink-600",
    roles: ["developer", "admin", "manager", "barista"],
  },
  {
    href: "/inventory",
    key: "inventory",
    iconName: "PackagePlus",
    iconGradient: "from-green-400 to-teal-600",
    roles: ["developer", "admin", "manager"],
  },
  {
    href: "/stock-take",
    key: "stockTake",
    iconName: "ClipboardCheck",
    iconGradient: "from-sky-400 to-blue-600",
    roles: ["developer", "admin", "manager"],
  },
  {
    href: "/expenses",
    key: "expenses",
    iconName: "Receipt",
    iconGradient: "from-yellow-400 to-amber-500",
    roles: ["developer", "admin", "manager", "cashier"],
  },
  {
    href: "/reports",
    key: "reports",
    iconName: "BarChart3",
    iconGradient: "from-emerald-500 to-teal-700",
    roles: ["developer", "admin", "manager"],
  },
  {
    href: "/settings",
    key: "settings",
    iconName: "Settings",
    iconGradient: "from-lime-500 to-green-700",
    roles: ["developer", "admin"],
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
