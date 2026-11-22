import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { computeMonthlyPnL } from "@/lib/pnl";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (
    !ctx.isConfigured ||
    !ctx.profile ||
    !["admin", "manager"].includes(ctx.profile.role)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : new Date().toISOString().slice(0, 7);
  const locale = normalizeLocale(searchParams.get("locale"));
  const t = getDictionary(locale);

  const pnl = await computeMonthlyPnL(supabase, month);

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `${ctx.settings?.shop_name ?? "Tà Ơi"} - ${t.reports.plStatementTitle} (${month})`,
    Author: "Lộc Vũ Trung",
    CreatedDate: new Date(),
  };

  // Sheet 2: Orders
  const ordersAoa: unknown[][] = [
    [t.pos.orderNo, t.common.date, t.pos.paymentMethod, t.common.total],
    ...pnl.rawOrders.map((o) => [
      o.order_number,
      o.created_at.slice(0, 10),
      o.payment_method,
      o.total_amount,
    ]),
  ];
  const ordersSheet = XLSX.utils.aoa_to_sheet(ordersAoa);
  ordersSheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  const lastOrderRow = Math.max(2, pnl.rawOrders.length + 1);

  // Sheet 3: Expenses (formula in col F = D/E)
  const expensesAoa: unknown[][] = [
    [
      t.common.date,
      t.expenses.expenseGroup,
      t.expenses.expenseTitle,
      t.expenses.amount,
      t.expenses.allocatedMonths,
      t.expenses.allocatedPerMonth,
    ],
    ...pnl.rawExpenses.map((e, idx) => {
      const r = idx + 2;
      return [
        e.expense_date,
        t.expenses.groups[e.expense_group],
        e.title,
        e.amount,
        e.allocated_months,
        { t: "n", f: `D${r}/E${r}`, z: "#,##0" },
      ];
    }),
  ];
  const expensesSheet = XLSX.utils.aoa_to_sheet(expensesAoa);
  expensesSheet["!cols"] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 30 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
  ];
  const lastExpRow = Math.max(2, pnl.rawExpenses.length + 1);

  // Sheet 4: StockMovements (formula in col F = -D*E)
  const stockAoa: unknown[][] = [
    [
      t.common.date,
      t.inventory.ingredientName,
      t.common.status,
      t.common.quantity,
      t.common.unitPrice,
      t.common.total,
    ],
    ...pnl.rawMovements.map((m, idx) => {
      const r = idx + 2;
      return [
        m.created_at.slice(0, 10),
        m.ingredient_name,
        m.movement_type,
        m.quantity_change,
        m.unit_cost,
        { t: "n", f: `-D${r}*E${r}`, z: "#,##0" },
      ];
    }),
  ];
  const stockSheet = XLSX.utils.aoa_to_sheet(stockAoa);
  stockSheet["!cols"] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
  ];
  const lastStockRow = Math.max(2, pnl.rawMovements.length + 1);

  // Sheet 1: P&L Summary referencing raw sheets via formulas
  const pnlAoa: unknown[][] = [
    [
      `${ctx.settings?.shop_name ?? "Tà Ơi"} - ${t.reports.plStatementTitle} (${month})`,
      ctx.settings?.currency_code ?? "LAK",
    ],
    [],
    [
      t.reports.netRevenue,
      { t: "n", f: `SUM(Orders!D2:D${lastOrderRow})`, z: "#,##0" },
    ],
    [
      t.reports.cogs,
      {
        t: "n",
        f: `SUMIF(StockMovements!C2:C${lastStockRow},"sale_deduction",StockMovements!F2:F${lastStockRow})`,
        z: "#,##0",
      },
    ],
    [
      t.reports.stockLoss,
      {
        t: "n",
        f: `SUMIF(StockMovements!C2:C${lastStockRow},"stock_take_adjust",StockMovements!F2:F${lastStockRow})+SUMIF(StockMovements!C2:C${lastStockRow},"waste",StockMovements!F2:F${lastStockRow})`,
        z: "#,##0",
      },
    ],
    [t.reports.grossProfit, { t: "n", f: "B3-B4-B5", z: "#,##0" }],
    [
      t.reports.operatingExpenses,
      { t: "n", f: `SUM(Expenses!F2:F${lastExpRow})`, z: "#,##0" },
    ],
    [t.reports.netProfit, { t: "n", f: "B6-B7", z: "#,##0" }],
    [t.reports.profitMargin, { t: "n", f: "IFERROR(B8/B3,0)", z: "0.0%" }],
  ];
  const pnlSheet = XLSX.utils.aoa_to_sheet(pnlAoa);
  pnlSheet["!cols"] = [{ wch: 42 }, { wch: 22 }];

  XLSX.utils.book_append_sheet(wb, pnlSheet, "P&L");
  XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders");
  XLSX.utils.book_append_sheet(wb, expensesSheet, "Expenses");
  XLSX.utils.book_append_sheet(wb, stockSheet, "StockMovements");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TaOi-PnL-${month}.xlsx"`,
    },
  });
}
