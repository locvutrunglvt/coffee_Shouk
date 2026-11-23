import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getLocalTodayStartIso } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n/server";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Coffee,
  PackagePlus,
  Receipt,
  ShoppingBag,
  Sprout,
  Wallet,
} from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const todayStartIso = getLocalTodayStartIso();

  const [{ profile, settings }, { t }, ordersRes, lowStockRes, recurringRes, openShiftRes] =
    await Promise.all([
      requireRouteAccess("/"),
      getServerI18n(),
      supabase
        ? supabase
            .from("orders")
            .select("total_amount, payment_status, status")
            .gte("created_at", todayStartIso)
            .eq("payment_status", "paid")
            .neq("status", "cancelled")
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("ingredients")
            .select("id, name, current_stock, min_stock_alert, base_unit")
            .eq("is_active", true)
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("recurring_expenses")
            .select("id, title, amount, next_due_date, expense_group")
            .eq("is_active", true)
            .order("next_due_date", { ascending: true })
            .limit(3)
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("shifts")
            .select("id, opened_at, opening_cash")
            .eq("status", "open")
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const todayOrders = ordersRes.data ?? [];
  const todayRevenue = todayOrders.reduce(
    (sum, row) => sum + Number(row.total_amount ?? 0),
    0
  );

  const lowStockItems = (lowStockRes.data ?? []).filter(
    (item) => Number(item.current_stock) <= Number(item.min_stock_alert)
  );

  const recurringReminders = recurringRes.data ?? [];
  const openShift = openShiftRes.data;

  const quickActions = [
    {
      href: "/pos",
      title: t.nav.pos,
      desc: t.dashboard.quickPosDesc,
      icon: ShoppingBag,
      grad: "from-lime-400 to-emerald-600",
    },
    {
      href: "/bar",
      title: t.nav.bar,
      desc: t.bar.subtitle,
      icon: Coffee,
      grad: "from-amber-400 to-orange-500",
    },
    {
      href: "/shifts",
      title: t.nav.shifts,
      desc: openShift ? t.dashboard.quickShiftOpen : t.dashboard.quickShiftClosed,
      icon: Wallet,
      grad: "from-teal-400 to-cyan-600",
    },
    {
      href: "/menu",
      title: t.nav.menu,
      desc: t.menu.subtitle,
      icon: BookOpen,
      grad: "from-rose-400 to-pink-600",
    },
    {
      href: "/inventory",
      title: t.nav.inventory,
      desc: t.dashboard.quickInvDesc,
      icon: PackagePlus,
      grad: "from-green-400 to-teal-600",
    },
    {
      href: "/stock-take",
      title: t.nav.stockTake,
      desc: t.dashboard.quickStockTakeDesc,
      icon: ClipboardCheck,
      grad: "from-sky-400 to-blue-600",
    },
    {
      href: "/expenses",
      title: t.nav.expenses,
      desc: t.dashboard.quickExpenseDesc,
      icon: Receipt,
      grad: "from-yellow-400 to-amber-500",
    },
    {
      href: "/reports",
      title: t.nav.reports,
      desc: t.reports.subtitle,
      icon: BarChart3,
      grad: "from-emerald-500 to-teal-700",
    },
  ];

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="card-3d rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#EAFBF0] via-white to-[#F0FDF4] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              <Sprout className="w-3.5 h-3.5" />
              <span>{settings.shop_name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
              {t.dashboard.welcome}, {profile.full_name}
            </h1>
            <p className="text-sm sm:text-base font-medium text-[#2F6844]">
              {t.dashboard.subtitle} {settings.shop_name}
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl btn-3d-green text-base font-extrabold"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>{t.dashboard.openPosBtn}</span>
          </Link>
        </div>

        <ModuleGuide guideKey="dashboard" />

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-3d rounded-2xl p-5 bg-gradient-to-br from-white to-[#ECFDF3]">
            <p className="text-sm font-bold text-[#2F6844]">
              {t.dashboard.todayRevenue}
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#15803D] mt-1.5">
              {formatMoney(todayRevenue, settings.currency_code)}
            </p>
            <p className="text-sm font-medium text-[#3B6B4C] mt-1">
              {todayOrders.length} {t.dashboard.paidOrdersCount}
            </p>
          </div>

          <div className="card-3d rounded-2xl p-5 bg-gradient-to-br from-white to-[#F0FDFA]">
            <p className="text-sm font-bold text-[#2F6844]">
              {t.dashboard.shiftStatus}
            </p>
            <p className="text-xl sm:text-2xl font-extrabold mt-1.5 text-[#0F766E]">
              {openShift ? t.dashboard.shiftOpen : t.dashboard.shiftClosed}
            </p>
            <p className="text-sm font-medium text-[#3B6B4C] mt-1">
              {openShift
                ? `${t.dashboard.openingCashLabel}: ${formatMoney(
                    openShift.opening_cash,
                    settings.currency_code
                  )}`
                : t.dashboard.goToShiftHint}
            </p>
          </div>

          <div className="card-3d rounded-2xl p-5 bg-gradient-to-br from-white to-[#FEF2F2]">
            <p className="text-sm font-bold text-[#2F6844]">
              {t.dashboard.lowStockTitle}
            </p>
            <p
              className={`text-2xl sm:text-3xl font-extrabold mt-1.5 ${
                lowStockItems.length > 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {lowStockItems.length} {t.dashboard.ingredientsWord}
            </p>
            <p className="text-sm font-medium text-[#3B6B4C] mt-1">
              {lowStockItems.length > 0
                ? t.dashboard.needRestock
                : t.dashboard.stockOk}
            </p>
          </div>

          <div className="card-3d rounded-2xl p-5 bg-gradient-to-br from-white to-[#FEFCE8]">
            <p className="text-sm font-bold text-[#2F6844]">
              {t.dashboard.recurringTitle}
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#B45309] mt-1.5">
              {recurringReminders.length} {t.dashboard.itemsWord}
            </p>
            <p className="text-sm font-medium text-[#3B6B4C] mt-1">
              {t.dashboard.recurringHint}
            </p>
          </div>
        </div>

        {/* Quick Actions 3D Grid */}
        <div>
          <h2 className="text-lg font-extrabold text-[#14532D] mb-3">
            {t.dashboard.quickAccess}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((act) => {
              const Icon = act.icon;
              return (
                <Link
                  key={act.href}
                  href={act.href}
                  className="group card-3d rounded-2xl p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${act.grad} text-white flex items-center justify-center shrink-0 icon-3d`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-extrabold text-[#14532D] truncate">
                        {act.title}
                      </p>
                      <p className="text-xs sm:text-sm font-medium text-[#3B6B4C] line-clamp-1">
                        {act.desc}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#16A34A] shrink-0 group-hover:translate-x-1 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-3d rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 font-extrabold text-base text-[#14532D]">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center icon-3d">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <span>{t.dashboard.lowStockCardTitle}</span>
            </div>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-[#3B6B4C]">{t.dashboard.noLowStock}</p>
            ) : (
              <ul className="divide-y divide-[#E3F5E9] text-sm">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="py-2.5 flex justify-between gap-2">
                    <span className="font-bold text-[#143321]">{item.name}</span>
                    <span className="text-rose-600 font-bold">
                      {t.dashboard.remaining} {item.current_stock} {item.base_unit} (
                      {t.dashboard.minAlert} {item.min_stock_alert})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-3d rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 font-extrabold text-base text-[#14532D]">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center icon-3d">
                <CalendarClock className="w-4 h-4" />
              </span>
              <span>{t.dashboard.recurringCardTitle}</span>
            </div>
            {recurringReminders.length === 0 ? (
              <p className="text-sm text-[#3B6B4C]">{t.dashboard.noRecurring}</p>
            ) : (
              <ul className="divide-y divide-[#E3F5E9] text-sm">
                {recurringReminders.map((r) => (
                  <li key={r.id} className="py-2.5 flex justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#143321]">{r.title}</p>
                      <p className="text-xs font-medium text-[#3B6B4C]">
                        {t.dashboard.dueDate}: {r.next_due_date}
                      </p>
                    </div>
                    <span className="font-extrabold text-[#15803D]">
                      {formatMoney(r.amount, settings.currency_code)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
