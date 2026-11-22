"use client";

import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import type { PnLSummary } from "@/lib/pnl";
import type { ExpenseGroup } from "@/lib/types";
import { useT } from "@/components/I18nProvider";
import { Download } from "lucide-react";

interface ReportsClientProps {
  currencyCode: string;
  summary: PnLSummary;
}

export function ReportsClient({ currencyCode, summary }: ReportsClientProps) {
  const router = useRouter();
  const { t, locale } = useT();

  const expenseEntries = (
    Object.entries(summary.expenseByGroup) as [ExpenseGroup, number][]
  ).filter(([, val]) => val > 0);

  return (
    <div className="space-y-6">
      {/* Month selector + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#4A3828]">
            {t.reports.selectMonth}:
          </label>
          <input
            type="month"
            value={summary.month}
            onChange={(e) => router.push(`/reports?month=${e.target.value}`)}
            className="px-3 py-2 text-xs rounded-xl border border-[#E7DDD0] bg-white font-semibold"
          />
        </div>

        <a
          href={`/api/reports/export?month=${encodeURIComponent(
            summary.month
          )}&locale=${locale}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold"
        >
          <Download className="w-4 h-4" />
          <span>{t.reports.exportExcelBtn}</span>
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
          <p className="text-xs text-[#7B6554]">{t.reports.netRevenue}</p>
          <p className="text-xl font-bold text-[#4A2C18] mt-1">
            {formatMoney(summary.netRevenue, currencyCode)}
          </p>
          <p className="text-[11px] text-[#7B6554] mt-1">
            {summary.ordersCount} {t.dashboard.paidOrdersCount}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
          <p className="text-xs text-[#7B6554]">{t.reports.grossProfit}</p>
          <p className="text-xl font-bold text-sky-700 mt-1">
            {formatMoney(summary.grossProfit, currencyCode)}
          </p>
          <p className="text-[11px] text-[#7B6554] mt-1">
            {t.reports.cogs}: {formatMoney(summary.cogs, currencyCode)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
          <p className="text-xs text-[#7B6554]">{t.reports.operatingExpenses}</p>
          <p className="text-xl font-bold text-[#C97B36] mt-1">
            {formatMoney(summary.totalOperatingExpenses, currencyCode)}
          </p>
          <p className="text-[11px] text-[#7B6554] mt-1">
            {t.reports.breakEvenDaily}:{" "}
            {formatMoney(summary.breakEvenDaily, currencyCode)}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            summary.netProfit >= 0
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <p className="text-xs text-[#4A3828]">{t.reports.netProfit}</p>
          <p
            className={`text-xl font-bold mt-1 ${
              summary.netProfit >= 0 ? "text-emerald-800" : "text-red-700"
            }`}
          >
            {formatMoney(summary.netProfit, currencyCode)}
          </p>
          <p className="text-[11px] text-[#4A3828] mt-1">
            {t.reports.profitMargin}: {summary.profitMarginPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-3">
        <h2 className="font-bold text-sm text-[#4A2C18]">
          {t.reports.plStatementTitle} ({summary.month})
        </h2>
        <div className="divide-y divide-[#F3ECE2] text-xs sm:text-sm">
          <div className="py-2.5 flex justify-between">
            <span>{t.reports.netRevenue}</span>
            <span className="font-bold text-[#4A2C18]">
              {formatMoney(summary.netRevenue, currencyCode)}
            </span>
          </div>
          <div className="py-2.5 flex justify-between text-[#7B6554]">
            <span className="pl-3">{t.reports.cashVsQr}</span>
            <span>
              {formatMoney(summary.cashRevenue, currencyCode)} /{" "}
              {formatMoney(summary.qrRevenue, currencyCode)}
            </span>
          </div>
          <div className="py-2.5 flex justify-between text-red-700">
            <span>(-) {t.reports.cogs}</span>
            <span>-{formatMoney(summary.cogs, currencyCode)}</span>
          </div>
          <div className="py-2.5 flex justify-between text-red-700">
            <span>(-) {t.reports.stockLoss}</span>
            <span>-{formatMoney(summary.stockLoss, currencyCode)}</span>
          </div>
          <div className="py-2.5 flex justify-between font-bold bg-[#FAF7F2] px-2 rounded">
            <span>(=) {t.reports.grossProfit}</span>
            <span>{formatMoney(summary.grossProfit, currencyCode)}</span>
          </div>
          <div className="py-2.5 flex justify-between text-red-700">
            <span>(-) {t.reports.operatingExpenses}</span>
            <span>
              -{formatMoney(summary.totalOperatingExpenses, currencyCode)}
            </span>
          </div>
          <div className="py-3 flex justify-between text-base font-bold text-[#4A2C18]">
            <span>(=) {t.reports.netProfit}</span>
            <span
              className={
                summary.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
              }
            >
              {formatMoney(summary.netProfit, currencyCode)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Products */}
        <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-3">
          <h3 className="font-bold text-sm text-[#4A2C18]">
            {t.reports.topProducts}
          </h3>
          {summary.topProducts.length === 0 ? (
            <p className="text-xs text-[#7B6554]">{t.common.noData}</p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E7DDD0] text-[#7B6554]">
                  <th className="py-2 pr-3">{t.menu.productName}</th>
                  <th className="py-2 pr-3">{t.reports.qtySold}</th>
                  <th className="py-2 pr-3 text-right">{t.reports.revenueCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3ECE2]">
                {summary.topProducts.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2 pr-3 font-semibold text-[#4A2C18]">
                      {p.name}
                    </td>
                    <td className="py-2 pr-3">{p.qty}</td>
                    <td className="py-2 pr-3 text-right font-semibold">
                      {formatMoney(p.revenue, currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-3">
          <h3 className="font-bold text-sm text-[#4A2C18]">
            {t.reports.expenseBreakdown}
          </h3>
          {expenseEntries.length === 0 ? (
            <p className="text-xs text-[#7B6554]">{t.common.noData}</p>
          ) : (
            <div className="space-y-2 text-xs">
              {expenseEntries.map(([g, val]) => (
                <div
                  key={g}
                  className="py-2 border-b border-[#F3ECE2] last:border-0 flex justify-between"
                >
                  <span className="font-medium text-[#4A3828]">
                    {t.expenses.groups[g]}
                  </span>
                  <span className="font-bold text-[#4A2C18]">
                    {formatMoney(val, currencyCode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
