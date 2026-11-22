import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseGroup } from "./types";

export interface PnLSummary {
  month: string;
  ordersCount: number;
  netRevenue: number;
  cashRevenue: number;
  qrRevenue: number;
  otherRevenue: number;
  cogs: number;
  stockLoss: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
  profitMarginPct: number;
  breakEvenDaily: number;
  expenseByGroup: Record<ExpenseGroup, number>;
  topProducts: { name: string; qty: number; revenue: number }[];
  rawOrders: {
    order_number: number;
    created_at: string;
    payment_method: string;
    total_amount: number;
  }[];
  rawExpenses: {
    expense_date: string;
    expense_group: ExpenseGroup;
    title: string;
    amount: number;
    allocated_months: number;
    allocated_for_month: number;
    billing_month: string;
  }[];
  rawMovements: {
    created_at: string;
    ingredient_name: string;
    movement_type: string;
    quantity_change: number;
    unit_cost: number;
    cost_value: number;
  }[];
}

function monthToIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 0;
  return y * 12 + (m - 1);
}

export function doesExpenseApplyToMonth(
  billingMonth: string,
  allocatedMonths: number,
  targetMonth: string
): boolean {
  const startIdx = monthToIndex(billingMonth);
  const targetIdx = monthToIndex(targetMonth);
  const span = Math.max(1, Number(allocatedMonths) || 1);
  return targetIdx >= startIdx && targetIdx < startIdx + span;
}

export async function computeMonthlyPnL(
  supabase: SupabaseClient,
  month: string
): Promise<PnLSummary> {
  const [yearNum, monthNum] = month.split("-").map(Number);
  const startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(yearNum, monthNum, 1, 0, 0, 0, 0);

  const [ordersRes, expensesRes, movementsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, created_at, total_amount, payment_method, payment_status, status, order_items(product_name, quantity, line_total)"
      )
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
      .order("created_at", { ascending: true }),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, expense_group, title, amount, billing_month, allocated_months"
      )
      .order("expense_date", { ascending: true }),
    supabase
      .from("stock_movements")
      .select(
        "created_at, movement_type, quantity_change, unit_cost, ingredients(name)"
      )
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString())
      .in("movement_type", ["sale_deduction", "stock_take_adjust", "waste"])
      .order("created_at", { ascending: true }),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as {
    order_number: number;
    created_at: string;
    total_amount: number;
    payment_method: string;
    order_items: { product_name: string; quantity: number; line_total: number }[];
  }[];

  let netRevenue = 0;
  let cashRevenue = 0;
  let qrRevenue = 0;
  let otherRevenue = 0;
  const prodStats = new Map<string, { qty: number; revenue: number }>();

  for (const o of orders) {
    const amt = Number(o.total_amount ?? 0);
    netRevenue += amt;
    if (o.payment_method === "cash") cashRevenue += amt;
    else if (o.payment_method === "qr_transfer") qrRevenue += amt;
    else otherRevenue += amt;

    for (const item of o.order_items ?? []) {
      const prev = prodStats.get(item.product_name) ?? { qty: 0, revenue: 0 };
      prodStats.set(item.product_name, {
        qty: prev.qty + Number(item.quantity ?? 0),
        revenue: prev.revenue + Number(item.line_total ?? 0),
      });
    }
  }

  const topProducts = Array.from(prodStats.entries())
    .map(([name, st]) => ({ name, qty: st.qty, revenue: st.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  let cogs = 0;
  let stockLoss = 0;
  const rawMovements: PnLSummary["rawMovements"] = [];

  for (const m of (movementsRes.data ?? []) as unknown as {
    created_at: string;
    movement_type: string;
    quantity_change: number;
    unit_cost: number;
    ingredients: { name: string } | null;
  }[]) {
    const qtyChange = Number(m.quantity_change ?? 0);
    const unitCost = Number(m.unit_cost ?? 0);
    // Negative quantity_change means stock out/shortage -> positive cost
    const costVal = -qtyChange * unitCost;
    if (m.movement_type === "sale_deduction") {
      cogs += Math.max(0, costVal);
    } else {
      stockLoss += costVal;
    }
    rawMovements.push({
      created_at: m.created_at,
      ingredient_name: m.ingredients?.name ?? "",
      movement_type: m.movement_type,
      quantity_change: qtyChange,
      unit_cost: unitCost,
      cost_value: costVal,
    });
  }

  const expenseByGroup: Record<ExpenseGroup, number> = {
    rent: 0,
    electricity: 0,
    water: 0,
    internet: 0,
    payroll: 0,
    maintenance: 0,
    marketing: 0,
    shift_petty_cash: 0,
    other: 0,
  };

  const rawExpenses: PnLSummary["rawExpenses"] = [];
  let totalOperatingExpenses = 0;

  for (const e of (expensesRes.data ?? []) as unknown as {
    expense_date: string;
    expense_group: ExpenseGroup;
    title: string;
    amount: number;
    billing_month: string;
    allocated_months: number;
  }[]) {
    const span = Math.max(1, Number(e.allocated_months) || 1);
    if (!doesExpenseApplyToMonth(e.billing_month, span, month)) continue;
    const allocatedAmt = Number(e.amount ?? 0) / span;
    expenseByGroup[e.expense_group] += allocatedAmt;
    totalOperatingExpenses += allocatedAmt;
    rawExpenses.push({
      expense_date: e.expense_date,
      expense_group: e.expense_group,
      title: e.title,
      amount: Number(e.amount ?? 0),
      allocated_months: span,
      allocated_for_month: allocatedAmt,
      billing_month: e.billing_month,
    });
  }

  const grossProfit = netRevenue - cogs - stockLoss;
  const netProfit = grossProfit - totalOperatingExpenses;
  const profitMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
  const grossMarginRatio = netRevenue > 0 ? grossProfit / netRevenue : 0;
  const breakEvenDaily =
    grossMarginRatio > 0
      ? totalOperatingExpenses / grossMarginRatio / 30
      : totalOperatingExpenses / 30;

  return {
    month,
    ordersCount: orders.length,
    netRevenue,
    cashRevenue,
    qrRevenue,
    otherRevenue,
    cogs,
    stockLoss,
    grossProfit,
    totalOperatingExpenses,
    netProfit,
    profitMarginPct,
    breakEvenDaily,
    expenseByGroup,
    topProducts,
    rawOrders: orders.map((o) => ({
      order_number: o.order_number,
      created_at: o.created_at,
      payment_method: o.payment_method,
      total_amount: Number(o.total_amount ?? 0),
    })),
    rawExpenses,
    rawMovements,
  };
}
