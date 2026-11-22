import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import { computeMonthlyPnL } from "@/lib/pnl";
import { ReportsClient } from "./ReportsClient";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ profile, settings }, { t }, params] = await Promise.all([
    requireRouteAccess("/reports"),
    getServerI18n(),
    searchParams,
  ]);
  const supabase = await createClient();

  const currentMonth =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : new Date().toISOString().slice(0, 7);

  const summary = supabase
    ? await computeMonthlyPnL(supabase, currentMonth)
    : await Promise.resolve({
        month: currentMonth,
        ordersCount: 0,
        netRevenue: 0,
        cashRevenue: 0,
        qrRevenue: 0,
        otherRevenue: 0,
        cogs: 0,
        stockLoss: 0,
        grossProfit: 0,
        totalOperatingExpenses: 0,
        netProfit: 0,
        profitMarginPct: 0,
        breakEvenDaily: 0,
        expenseByGroup: {
          rent: 0,
          electricity: 0,
          water: 0,
          internet: 0,
          payroll: 0,
          maintenance: 0,
          marketing: 0,
          shift_petty_cash: 0,
          other: 0,
        },
        topProducts: [],
        rawOrders: [],
        rawExpenses: [],
        rawMovements: [],
      });

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.reports.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.reports.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="reports" />
        <ReportsClient currencyCode={settings.currency_code} summary={summary} />
      </div>
    </AppShell>
  );
}
