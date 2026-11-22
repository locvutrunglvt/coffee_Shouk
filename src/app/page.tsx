import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n/server";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  PackagePlus,
  Receipt,
  ShoppingBag,
  Wallet,
} from "lucide-react";

export default async function DashboardPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [ordersRes, lowStockRes, recurringRes, openShiftRes] = supabase
    ? await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, payment_status, status")
          .gte("created_at", todayStart.toISOString())
          .eq("payment_status", "paid")
          .neq("status", "cancelled"),
        supabase
          .from("ingredients")
          .select("id, name, current_stock, min_stock_alert, base_unit")
          .eq("is_active", true),
        supabase
          .from("recurring_expenses")
          .select("id, title, amount, next_due_date, expense_group")
          .eq("is_active", true)
          .order("next_due_date", { ascending: true })
          .limit(3),
        supabase
          .from("shifts")
          .select("id, opened_at, opening_cash")
          .eq("status", "open")
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: null }];

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
    },
    {
      href: "/shifts",
      title: t.nav.shifts,
      desc: openShift ? t.dashboard.quickShiftOpen : t.dashboard.quickShiftClosed,
      icon: Wallet,
    },
    {
      href: "/inventory",
      title: t.nav.inventory,
      desc: t.dashboard.quickInvDesc,
      icon: PackagePlus,
    },
    {
      href: "/stock-take",
      title: t.nav.stockTake,
      desc: t.dashboard.quickStockTakeDesc,
      icon: ClipboardCheck,
    },
    {
      href: "/expenses",
      title: t.nav.expenses,
      desc: t.dashboard.quickExpenseDesc,
      icon: Receipt,
    },
  ];

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#4A2C18]">
              {t.dashboard.welcome}, {profile.full_name}
            </h1>
            <p className="text-xs sm:text-sm text-[#7B6554]">
              {t.dashboard.subtitle} {settings.shop_name}
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-semibold hover:bg-[#3A2212]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{t.dashboard.openPosBtn}</span>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">{t.dashboard.todayRevenue}</p>
            <p className="text-2xl font-bold text-[#4A2C18] mt-1">
              {formatMoney(todayRevenue, settings.currency_code)}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {todayOrders.length} {t.dashboard.paidOrdersCount}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">{t.dashboard.shiftStatus}</p>
            <p className="text-lg font-bold mt-1 text-[#4A2C18]">
              {openShift ? t.dashboard.shiftOpen : t.dashboard.shiftClosed}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {openShift
                ? `${t.dashboard.openingCashLabel}: ${formatMoney(
                    openShift.opening_cash,
                    settings.currency_code
                  )}`
                : t.dashboard.goToShiftHint}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">{t.dashboard.lowStockTitle}</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                lowStockItems.length > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {lowStockItems.length} {t.dashboard.ingredientsWord}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {lowStockItems.length > 0
                ? t.dashboard.needRestock
                : t.dashboard.stockOk}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">{t.dashboard.recurringTitle}</p>
            <p className="text-2xl font-bold text-[#4A2C18] mt-1">
              {recurringReminders.length} {t.dashboard.itemsWord}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">{t.dashboard.recurringHint}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-bold text-[#4A2C18] mb-3">
            {t.dashboard.quickAccess}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((act) => {
              const Icon = act.icon;
              return (
                <Link
                  key={act.href}
                  href={act.href}
                  className="group bg-white rounded-2xl border border-[#E7DDD0] p-4 flex items-center justify-between hover:border-[#C97B36] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F3ECE2] text-[#4A2C18] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#4A2C18]">
                        {act.title}
                      </p>
                      <p className="text-xs text-[#7B6554]">{act.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8C7563] group-hover:translate-x-0.5 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#4A2C18]">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{t.dashboard.lowStockCardTitle}</span>
            </div>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-[#7B6554]">{t.dashboard.noLowStock}</p>
            ) : (
              <ul className="divide-y divide-[#F3ECE2] text-xs">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="py-2 flex justify-between">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-red-700 font-semibold">
                      {t.dashboard.remaining} {item.current_stock} {item.base_unit} (
                      {t.dashboard.minAlert} {item.min_stock_alert})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#4A2C18]">
              <CalendarClock className="w-4 h-4 text-[#C97B36]" />
              <span>{t.dashboard.recurringCardTitle}</span>
            </div>
            {recurringReminders.length === 0 ? (
              <p className="text-xs text-[#7B6554]">{t.dashboard.noRecurring}</p>
            ) : (
              <ul className="divide-y divide-[#F3ECE2] text-xs">
                {recurringReminders.map((r) => (
                  <li key={r.id} className="py-2 flex justify-between">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-[#7B6554]">
                        {t.dashboard.dueDate}: {r.next_due_date}
                      </p>
                    </div>
                    <span className="font-semibold text-[#4A2C18]">
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
