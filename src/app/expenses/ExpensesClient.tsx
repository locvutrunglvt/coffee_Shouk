"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { doesExpenseApplyToMonth } from "@/lib/pnl";
import { useT } from "@/components/I18nProvider";
import { compressAndUploadImage } from "@/lib/uploadImage";
import type { UserProfile } from "@/lib/auth";
import type { ExpenseGroup } from "@/lib/types";
import {
  Calculator,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Plus,
  Receipt,
  Trash2,
  Upload,
} from "lucide-react";

export interface ExpenseRow {
  id: string;
  expense_group: ExpenseGroup;
  title: string;
  amount: number;
  expense_date: string;
  billing_month: string;
  meter_old: number | null;
  meter_new: number | null;
  unit_price: number | null;
  allocated_months: number;
  receipt_image_url: string;
  note: string;
}

export interface RecurringExpenseRow {
  id: string;
  title: string;
  expense_group: ExpenseGroup;
  amount: number;
  billing_cycle_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active: boolean;
  note: string;
}

const EXPENSE_GROUPS: ExpenseGroup[] = [
  "rent",
  "electricity",
  "water",
  "internet",
  "payroll",
  "maintenance",
  "marketing",
  "shift_petty_cash",
  "other",
];

interface ExpensesClientProps {
  profile: UserProfile;
  currencyCode: string;
  initialExpenses: ExpenseRow[];
  initialRecurring: RecurringExpenseRow[];
}

export function ExpensesClient({
  profile,
  currencyCode,
  initialExpenses,
  initialRecurring,
}: ExpensesClientProps) {
  const { t } = useT();
  const isAdmin = profile.role === "admin";
  const [tab, setTab] = useState<"expenses" | "recurring">("expenses");
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses);
  const [recurring, setRecurring] =
    useState<RecurringExpenseRow[]>(initialRecurring);
  const [notice, setNotice] = useState<string | null>(null);

  // Add Expense form
  const [group, setGroup] = useState<ExpenseGroup>("electricity");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [billingMonth, setBillingMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [meterOld, setMeterOld] = useState("");
  const [meterNew, setMeterNew] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [allocatedMonths, setAllocatedMonths] = useState("1");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  // Recurring form
  const [recTitle, setRecTitle] = useState("");
  const [recGroup, setRecGroup] = useState<ExpenseGroup>("rent");
  const [recAmount, setRecAmount] = useState("");
  const [recCycle, setRecCycle] = useState("1");
  const [recDueDate, setRecDueDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [recRemindDays, setRecRemindDays] = useState("5");

  const isUtility = group === "electricity" || group === "water";
  const usageQty =
    meterOld !== "" && meterNew !== ""
      ? Math.max(0, Number(meterNew) - Number(meterOld))
      : null;

  function autoComputeUtilityAmount() {
    if (usageQty === null) return;
    const rate = Number(unitPrice) || 0;
    setAmount(String(Math.round(usageQty * rate)));
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const url = await compressAndUploadImage(file, "receipts");
      setReceiptUrl(url);
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !amount) return;
    setSaving(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const effectiveGroup: ExpenseGroup = isAdmin ? group : "shift_petty_cash";
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          expense_group: effectiveGroup,
          title: title.trim(),
          amount: Number(amount) || 0,
          expense_date: expenseDate,
          billing_month: billingMonth,
          meter_old: isUtility && meterOld !== "" ? Number(meterOld) : null,
          meter_new: isUtility && meterNew !== "" ? Number(meterNew) : null,
          unit_price: isUtility && unitPrice !== "" ? Number(unitPrice) : null,
          allocated_months: Math.max(1, Number(allocatedMonths) || 1),
          receipt_image_url: receiptUrl.trim(),
          created_by: profile.id,
        })
        .select()
        .single();

      if (!error && data) {
        setExpenses((prev) => [data as ExpenseRow, ...prev]);
        setTitle("");
        setAmount("");
        setMeterOld("");
        setMeterNew("");
        setUnitPrice("");
        setAllocatedMonths("1");
        setReceiptUrl("");
        setNotice(t.common.success);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!isAdmin) return;
    const supabase = createClient();
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) setExpenses((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleAddRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || !recTitle.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("recurring_expenses")
      .insert({
        title: recTitle.trim(),
        expense_group: recGroup,
        amount: Number(recAmount) || 0,
        billing_cycle_months: Math.max(1, Number(recCycle) || 1),
        next_due_date: recDueDate,
        reminder_days_before: Math.max(0, Number(recRemindDays) || 5),
      })
      .select()
      .single();
    if (!error && data) {
      setRecurring((prev) => [...prev, data as RecurringExpenseRow]);
      setRecTitle("");
      setRecAmount("");
    }
  }

  async function handlePayRecurring(rec: RecurringExpenseRow) {
    if (!isAdmin) return;
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const { data: expData } = await supabase
      .from("expenses")
      .insert({
        expense_group: rec.expense_group,
        title: rec.title,
        amount: rec.amount,
        expense_date: today,
        billing_month: month,
        allocated_months: rec.billing_cycle_months,
        created_by: profile.id,
      })
      .select()
      .single();

    const nextDate = new Date(rec.next_due_date);
    nextDate.setMonth(nextDate.getMonth() + rec.billing_cycle_months);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    await supabase
      .from("recurring_expenses")
      .update({ next_due_date: nextDateStr })
      .eq("id", rec.id);

    if (expData) {
      setExpenses((prev) => [expData as ExpenseRow, ...prev]);
    }
    setRecurring((prev) =>
      prev.map((r) =>
        r.id === rec.id ? { ...r, next_due_date: nextDateStr } : r
      )
    );
    setNotice(t.common.success);
  }

  const cashOutMonth = expenses
    .filter((e) => e.expense_date.startsWith(filterMonth))
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  const monthRows = expenses.filter(
    (e) =>
      e.expense_date.startsWith(filterMonth) ||
      doesExpenseApplyToMonth(e.billing_month, e.allocated_months, filterMonth)
  );

  const allocatedMonthCost = expenses
    .filter((e) =>
      doesExpenseApplyToMonth(e.billing_month, e.allocated_months, filterMonth)
    )
    .reduce(
      (sum, e) =>
        sum + Number(e.amount ?? 0) / Math.max(1, Number(e.allocated_months) || 1),
      0
    );

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 bg-white p-1 rounded-xl border border-[#E7DDD0]">
          <button
            type="button"
            onClick={() => setTab("expenses")}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium cursor-pointer ${
              tab === "expenses"
                ? "bg-[#4A2C18] text-white"
                : "text-[#5C4938] hover:bg-[#F3ECE2]"
            }`}
          >
            {t.expenses.expensesTab}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab("recurring")}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium cursor-pointer ${
                tab === "recurring"
                  ? "bg-[#4A2C18] text-white"
                  : "text-[#5C4938] hover:bg-[#F3ECE2]"
              }`}
            >
              {t.expenses.recurringTab}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[#7B6554]">{t.expenses.filterMonth}:</label>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#E7DDD0] bg-white"
          />
        </div>
      </div>

      {tab === "expenses" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
              <p className="text-xs text-[#7B6554]">
                {t.expenses.totalMonthCashOut} ({filterMonth})
              </p>
              <p className="text-xl font-bold text-[#4A2C18] mt-1">
                {formatMoney(cashOutMonth, currencyCode)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
              <p className="text-xs text-[#7B6554]">
                {t.expenses.allocatedMonthCost} ({filterMonth})
              </p>
              <p className="text-xl font-bold text-[#C97B36] mt-1">
                {formatMoney(allocatedMonthCost, currencyCode)}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddExpense}
            className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-4"
          >
            <div className="flex items-center gap-2 font-bold text-sm text-[#4A2C18]">
              <Receipt className="w-5 h-5 text-[#C97B36]" />
              <h2>{t.expenses.addExpenseTitle}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.expenseGroup}
                </label>
                <select
                  value={isAdmin ? group : "shift_petty_cash"}
                  disabled={!isAdmin}
                  onChange={(e) => setGroup(e.target.value as ExpenseGroup)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0] bg-white disabled:opacity-60"
                >
                  {EXPENSE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {t.expenses.groups[g]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.expenseTitle}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.expenses.expenseTitlePlaceholder}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.amount} ({currencyCode})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0] font-semibold"
                />
              </div>
            </div>

            {isAdmin && isUtility && (
              <div className="bg-[#FAF7F2] rounded-xl border border-[#E7DDD0] p-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-[#7B6554] mb-1">
                    {t.expenses.meterOld}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={meterOld}
                    onChange={(e) => setMeterOld(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#E7DDD0] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#7B6554] mb-1">
                    {t.expenses.meterNew}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={meterNew}
                    onChange={(e) => setMeterNew(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#E7DDD0] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#7B6554] mb-1">
                    {t.expenses.unitPrice}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#E7DDD0] bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={autoComputeUtilityAmount}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C97B36] text-white text-xs font-semibold cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>
                    {usageQty !== null ? `${usageQty} → ` : ""}
                    {t.expenses.autoCalcBtn}
                  </span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.expenseDate}
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.billingMonth}
                </label>
                <input
                  type="month"
                  value={billingMonth}
                  onChange={(e) => setBillingMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.allocatedMonths}
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={allocatedMonths}
                  onChange={(e) => setAllocatedMonths(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A3828] mb-1">
                  {t.expenses.receiptUrl}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-2.5 py-2 text-xs rounded-xl border border-[#E7DDD0]"
                  />
                  <label className="px-2.5 py-2 rounded-xl border border-[#E7DDD0] bg-[#FAF7F2] cursor-pointer flex items-center">
                    <Upload className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {uploadingReceipt && (
                  <p className="text-[10px] text-[#7B6554] mt-0.5">
                    {t.common.loading}
                  </p>
                )}
              </div>
            </div>

            {Number(allocatedMonths) > 1 && Number(amount) > 0 && (
              <p className="text-xs text-[#C97B36] font-semibold">
                {t.expenses.allocatedPerMonth}:{" "}
                {formatMoney(
                  Number(amount) / Number(allocatedMonths),
                  currencyCode
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>{t.expenses.addExpenseBtn}</span>
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E7DDD0] text-[#7B6554]">
                  <th className="py-2 pr-3">{t.common.date}</th>
                  <th className="py-2 pr-3">{t.expenses.expenseGroup}</th>
                  <th className="py-2 pr-3">{t.expenses.expenseTitle}</th>
                  <th className="py-2 pr-3">{t.expenses.amount}</th>
                  <th className="py-2 pr-3">{t.expenses.allocatedPerMonth}</th>
                  <th className="py-2 pr-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3ECE2]">
                {monthRows.map((exp) => {
                  const perMonth =
                    Number(exp.amount) /
                    Math.max(1, Number(exp.allocated_months) || 1);
                  return (
                    <tr key={exp.id}>
                      <td className="py-2.5 pr-3">{exp.expense_date}</td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded-full bg-[#F3ECE2] text-[#4A2C18] font-medium">
                          {t.expenses.groups[exp.expense_group]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-[#4A2C18]">{exp.title}</p>
                        {exp.meter_old !== null && exp.meter_new !== null && (
                          <p className="text-[11px] text-[#7B6554]">
                            {exp.meter_old} → {exp.meter_new} (
                            {Number(exp.meter_new) - Number(exp.meter_old)})
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-bold">
                        {formatMoney(exp.amount, currencyCode)}
                      </td>
                      <td className="py-2.5 pr-3 text-[#C97B36] font-semibold">
                        {formatMoney(perMonth, currencyCode)}
                        {exp.allocated_months > 1
                          ? ` (${exp.allocated_months}m)`
                          : ""}
                      </td>
                      <td className="py-2.5 pr-3 flex items-center gap-2">
                        {exp.receipt_image_url && (
                          <a
                            href={exp.receipt_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-sky-700 hover:bg-sky-50 rounded"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "recurring" && isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form
            onSubmit={handleAddRecurring}
            className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-3 h-fit"
          >
            <h2 className="font-bold text-sm text-[#4A2C18] flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#C97B36]" />
              <span>{t.expenses.addRecurringTitle}</span>
            </h2>
            <input
              type="text"
              required
              value={recTitle}
              onChange={(e) => setRecTitle(e.target.value)}
              placeholder={t.expenses.expenseTitlePlaceholder}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={recGroup}
                onChange={(e) => setRecGroup(e.target.value as ExpenseGroup)}
                className="px-3 py-2 text-xs rounded-xl border border-[#E7DDD0] bg-white"
              >
                {EXPENSE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {t.expenses.groups[g]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                required
                min="0"
                value={recAmount}
                onChange={(e) => setRecAmount(e.target.value)}
                placeholder={t.expenses.amount}
                className="px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
              />
              <input
                type="number"
                min="1"
                value={recCycle}
                onChange={(e) => setRecCycle(e.target.value)}
                placeholder={t.expenses.cycleMonths}
                className="px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
              />
              <input
                type="date"
                value={recDueDate}
                onChange={(e) => setRecDueDate(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
              />
            </div>
            <input
              type="number"
              min="0"
              value={recRemindDays}
              onChange={(e) => setRecRemindDays(e.target.value)}
              placeholder={t.expenses.reminderDays}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#4A2C18] text-white text-xs font-semibold cursor-pointer"
            >
              {t.common.add}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-3">
            {recurring.map((rec) => (
              <div
                key={rec.id}
                className="p-3 rounded-xl border border-[#E7DDD0] bg-[#FAF7F2] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold text-[#4A2C18]">{rec.title}</p>
                  <p className="text-[#7B6554]">
                    {t.expenses.groups[rec.expense_group]} •{" "}
                    {t.dashboard.dueDate}: <strong>{rec.next_due_date}</strong> (
                    {rec.billing_cycle_months}m)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#4A2C18]">
                    {formatMoney(rec.amount, currencyCode)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePayRecurring(rec)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                  >
                    {t.expenses.markPaidNow}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
