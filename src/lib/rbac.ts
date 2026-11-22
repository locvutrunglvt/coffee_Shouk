export type UserRole = "admin" | "manager" | "cashier" | "staff" | "barista";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
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

export const ROLE_META: Record<
  UserRole,
  { label: string; description: string; badgeClass: string; defaultRoute: string }
> = {
  admin: {
    label: "Chủ quán",
    description: "Toàn quyền: POS, Kho, Chi phí, Lãi/Lỗ (P&L) & Phân quyền",
    badgeClass: "bg-amber-900/15 text-amber-900 border-amber-900/25",
    defaultRoute: "/",
  },
  manager: {
    label: "Quản lý ca",
    description: "POS, Ca làm việc, Menu, Nhập/Kiểm kho, Doanh thu ngày",
    badgeClass: "bg-emerald-700/15 text-emerald-800 border-emerald-700/25",
    defaultRoute: "/",
  },
  cashier: {
    label: "Thu ngân",
    description: "Bán hàng POS, Thu tiền, Mở/Kết ca & Chi lặt vặt trong ca",
    badgeClass: "bg-sky-700/15 text-sky-800 border-sky-700/25",
    defaultRoute: "/pos",
  },
  staff: {
    label: "Phục vụ",
    description: "Order tại bàn trên điện thoại & theo dõi trạng thái món",
    badgeClass: "bg-violet-700/15 text-violet-800 border-violet-700/25",
    defaultRoute: "/pos",
  },
  barista: {
    label: "Pha chế",
    description: "Màn hình hàng chờ món (KDS) & báo hết nguyên liệu/món",
    badgeClass: "bg-orange-700/15 text-orange-800 border-orange-700/25",
    defaultRoute: "/bar",
  },
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Tổng quan",
    shortLabel: "Tổng quan",
    iconName: "LayoutDashboard",
    roles: ["admin", "manager"],
    mobilePrimary: true,
  },
  {
    href: "/pos",
    label: "Bán hàng (POS)",
    shortLabel: "Bán hàng",
    iconName: "ShoppingBag",
    roles: ["admin", "manager", "cashier", "staff"],
    mobilePrimary: true,
  },
  {
    href: "/bar",
    label: "Pha chế (Bar)",
    shortLabel: "Pha chế",
    iconName: "Coffee",
    roles: ["admin", "manager", "cashier", "staff", "barista"],
    mobilePrimary: true,
  },
  {
    href: "/shifts",
    label: "Ca & Cân đối tiền",
    shortLabel: "Kết ca",
    iconName: "Wallet",
    roles: ["admin", "manager", "cashier"],
    mobilePrimary: true,
  },
  {
    href: "/menu",
    label: "Thực đơn",
    shortLabel: "Menu",
    iconName: "BookOpen",
    roles: ["admin", "manager", "barista"],
  },
  {
    href: "/inventory",
    label: "Nhập & Tồn kho",
    shortLabel: "Kho",
    iconName: "PackagePlus",
    roles: ["admin", "manager"],
  },
  {
    href: "/stock-take",
    label: "Kiểm kê & Cân đối",
    shortLabel: "Kiểm kho",
    iconName: "ClipboardCheck",
    roles: ["admin", "manager"],
  },
  {
    href: "/expenses",
    label: "Điện, Nước & Chi phí",
    shortLabel: "Chi phí",
    iconName: "Receipt",
    roles: ["admin", "manager", "cashier"],
  },
  {
    href: "/reports",
    label: "Báo cáo Lãi/Lỗ",
    shortLabel: "Lãi/Lỗ",
    iconName: "BarChart3",
    roles: ["admin", "manager"],
  },
  {
    href: "/settings",
    label: "Cài đặt & Phân quyền",
    shortLabel: "Cài đặt",
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
