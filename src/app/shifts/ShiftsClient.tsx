"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeVN, formatMoney, getLocalTodayDateStr } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import type { UserProfile } from "@/lib/auth";
import { CheckCircle2, Lock, Play, PlusCircle, Wallet } from "lucide-react";

export interface ShiftRow {
  id: string;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  total_cash_sales: number;
  total_qr_sales: number;
  total_other_sales: number;
  total_petty_expenses: number;
  expected_cash: number;
  actual_cash: number | null;
  cash_difference: number | null;
  status: "open" | "closed";
  notes: string;
}

export interface ShiftPettyExpenseRow {
  id: string;
  title: string;
  amount: number;
  created_at: string;
}

interface ShiftsClientProps {
  profile: UserProfile;
  currencyCode: string;
  initialOpenShift: ShiftRow | null;
  initialPettyExpenses: ShiftPettyExpenseRow[];
  initialClosedShifts: ShiftRow[];
}

export function ShiftsClient({
  profile,
  currencyCode,
  initialOpenShift,
  initialPettyExpenses,
  initialClosedShifts,
}: ShiftsClientProps) {
  const { t } = useT();
  const [openShift, setOpenShift] = useState<ShiftRow | null>(initialOpenShift);
  const [pettyList, setPettyList] =
    useState<ShiftPettyExpenseRow[]>(initialPettyExpenses);
  const [closedShifts, setClosedShifts] =
    useState<ShiftRow[]>(initialClosedShifts);

  const [openingCash, setOpeningCash] = useState("500000");
  const [pettyTitle, setPettyTitle] = useState("");
  const [pettyAmount, setPettyAmount] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      // Guard against duplicate open shifts from another device
      const { data: existingOpen } = await supabase
        .from("shifts")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingOpen) {
        setOpenShift(existingOpen as ShiftRow);
        return;
      }

      const startCash = Number(openingCash) || 0;
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          opened_by: profile.id,
          opening_cash: startCash,
          expected_cash: startCash,
          status: "open",
        })
        .select()
        .single();
      if (!error && data) {
        setOpenShift(data as ShiftRow);
        setPettyList([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPetty(e: React.FormEvent) {
    e.preventDefault();
    if (!openShift || !pettyTitle.trim() || !pettyAmount) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const amt = Number(pettyAmount) || 0;
      const today = getLocalTodayDateStr();
      const month = today.slice(0, 7);

      const { data: expData, error: expErr } = await supabase
        .from("expenses")
        .insert({
          expense_group: "shift_petty_cash",
          title: pettyTitle.trim(),
          amount: amt,
          expense_date: today,
          billing_month: month,
          shift_id: openShift.id,
          payment_method: "cash",
          created_by: profile.id,
        })
        .select("id, title, amount, created_at")
        .single();

      if (expErr || !expData) throw expErr;

      const { error: rpcErr } = await supabase.rpc("adjust_shift_totals", {
        p_shift_id: openShift.id,
        p_cash_delta: 0,
        p_qr_delta: 0,
        p_other_delta: 0,
        p_petty_delta: amt,
      });

      const nextPettyTotal = Number(openShift.total_petty_expenses) + amt;
      const nextExpected =
        Number(openShift.opening_cash) +
        Number(openShift.total_cash_sales) -
        nextPettyTotal;

      if (rpcErr) {
        await supabase
          .from("shifts")
          .update({
            total_petty_expenses: nextPettyTotal,
            expected_cash: nextExpected,
          })
          .eq("id", openShift.id);
      }

      setOpenShift({
        ...openShift,
        total_petty_expenses: nextPettyTotal,
        expected_cash: nextExpected,
      });
      setPettyList((prev) => [expData as ShiftPettyExpenseRow, ...prev]);
      setPettyTitle("");
      setPettyAmount("");
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault();
    if (!openShift) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const actual = Number(actualCash) || 0;
      const expected = Number(openShift.expected_cash);
      const diff = actual - expected;

      const { data, error } = await supabase
        .from("shifts")
        .update({
          closed_by: profile.id,
          closed_at: new Date().toISOString(),
          actual_cash: actual,
          cash_difference: diff,
          status: "closed",
          notes: closeNotes.trim(),
        })
        .eq("id", openShift.id)
        .select()
        .single();

      if (!error && data) {
        setClosedShifts((prev) => [data as ShiftRow, ...prev]);
        setOpenShift(null);
        setActualCash("");
        setCloseNotes("");
      }
    } finally {
      setBusy(false);
    }
  }

  const diffPreview =
    openShift && actualCash !== ""
      ? Number(actualCash) - Number(openShift.expected_cash)
      : null;

  return (
    <div className="space-y-6">
      {!openShift ? (
        <form
          onSubmit={handleOpenShift}
          className="card-3d rounded-2xl p-5 max-w-md space-y-4"
        >
          <div className="flex items-center gap-2 font-bold text-[#14532D]">
            <Wallet className="w-5 h-5 text-[#15803D]" />
            <h2>{t.shifts.noOpenShift}</h2>
          </div>
          <div>
            <label className="block text-base font-extrabold text-[#14532D] mb-1">
              {t.shifts.openingCash} ({currencyCode})
            </label>
            <input
              type="number"
              min="0"
              required
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            <Play className="w-4 h-4" />
            <span>{t.shifts.openShiftBtn}</span>
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          {/* Active Shift Summary */}
          <div className="card-3d rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  {t.shifts.statusOpen}
                </span>
                <span className="text-xs text-[#2F6844]">
                  {t.shifts.openedAt}: {formatDateTimeVN(openShift.opened_at)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5]">
                <p className="text-[11px] text-[#2F6844]">{t.shifts.openingCash}</p>
                <p className="text-base font-extrabold text-[#14532D] mt-1">
                  {formatMoney(openShift.opening_cash, currencyCode)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5]">
                <p className="text-[11px] text-[#2F6844]">{t.shifts.cashSales}</p>
                <p className="text-sm font-bold text-emerald-700 mt-1">
                  +{formatMoney(openShift.total_cash_sales, currencyCode)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5]">
                <p className="text-[11px] text-[#2F6844]">{t.shifts.pettyExpenses}</p>
                <p className="text-sm font-bold text-red-700 mt-1">
                  -{formatMoney(openShift.total_petty_expenses, currencyCode)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#16A34A] text-white">
                <p className="text-[11px] text-white/80">{t.shifts.expectedCash}</p>
                <p className="text-sm font-bold mt-1">
                  {formatMoney(openShift.expected_cash, currencyCode)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5]">
                <p className="text-[11px] text-[#2F6844]">{t.shifts.qrSales}</p>
                <p className="text-sm font-bold text-sky-700 mt-1">
                  {formatMoney(openShift.total_qr_sales, currencyCode)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5]">
                <p className="text-[11px] text-[#2F6844]">{t.shifts.otherSales}</p>
                <p className="text-base font-extrabold text-[#14532D] mt-1">
                  {formatMoney(openShift.total_other_sales, currencyCode)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Petty Cash Form */}
            <div className="card-3d rounded-2xl p-5 space-y-4">
              <form onSubmit={handleAddPetty} className="space-y-3">
                <h3 className="font-bold text-sm text-[#14532D] flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-[#15803D]" />
                  <span>{t.shifts.addPettyTitle}</span>
                </h3>
                <input
                  type="text"
                  required
                  value={pettyTitle}
                  onChange={(e) => setPettyTitle(e.target.value)}
                  placeholder={t.shifts.pettyTitlePlaceholder}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
                <input
                  type="number"
                  required
                  min="1"
                  value={pettyAmount}
                  onChange={(e) => setPettyAmount(e.target.value)}
                  placeholder={`${t.shifts.pettyAmount} (${currencyCode})`}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {t.shifts.addPettyBtn}
                </button>
              </form>

              <div className="border-t border-[#DDF3E4] pt-3 space-y-2">
                <p className="text-xs font-semibold text-[#2F6844]">
                  {t.shifts.pettyListTitle}
                </p>
                {pettyList.length === 0 ? (
                  <p className="text-xs text-[#2F6844]">{t.common.noData}</p>
                ) : (
                  <ul className="divide-y divide-[#DDF3E4] text-xs">
                    {pettyList.map((item) => (
                      <li key={item.id} className="py-2 flex justify-between">
                        <span>{item.title}</span>
                        <span className="font-semibold text-red-700">
                          -{formatMoney(item.amount, currencyCode)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Close Shift Form */}
            <form
              onSubmit={handleCloseShift}
              className="card-3d rounded-2xl p-5 space-y-3 h-fit"
            >
              <h3 className="font-bold text-sm text-[#14532D] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#14532D]" />
                <span>{t.shifts.closeShiftTitle}</span>
              </h3>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.shifts.actualCashCounted} ({currencyCode})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] font-semibold"
                />
              </div>

              {diffPreview !== null && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    diffPreview === 0
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : diffPreview > 0
                      ? "bg-sky-50 text-sky-800 border border-sky-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {diffPreview === 0
                      ? t.shifts.matched
                      : diffPreview > 0
                      ? t.shifts.surplus
                      : t.shifts.shortage}
                  </span>
                  <span>
                    {diffPreview > 0 ? "+" : ""}
                    {formatMoney(diffPreview, currencyCode)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.shifts.closeNotes}
                </label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                {t.shifts.closeShiftBtn}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Closed Shifts History */}
      <div className="card-3d rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm text-[#14532D]">{t.shifts.historyTitle}</h2>
        {closedShifts.length === 0 ? (
          <p className="text-xs text-[#2F6844]">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                  <th className="py-2 pr-3">{t.shifts.openedAt}</th>
                  <th className="py-2 pr-3">{t.shifts.cashSales}</th>
                  <th className="py-2 pr-3">{t.shifts.qrSales}</th>
                  <th className="py-2 pr-3">{t.shifts.expectedCash}</th>
                  <th className="py-2 pr-3">{t.shifts.actualCashCounted}</th>
                  <th className="py-2 pr-3">{t.shifts.cashDifference}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDF3E4]">
                {closedShifts.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3">{formatDateTimeVN(s.opened_at)}</td>
                    <td className="py-2.5 pr-3">
                      {formatMoney(s.total_cash_sales, currencyCode)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {formatMoney(s.total_qr_sales, currencyCode)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {formatMoney(s.expected_cash, currencyCode)}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold">
                      {formatMoney(s.actual_cash, currencyCode)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 font-bold ${
                        Number(s.cash_difference) === 0
                          ? "text-emerald-700"
                          : Number(s.cash_difference) > 0
                          ? "text-sky-700"
                          : "text-red-700"
                      }`}
                    >
                      {Number(s.cash_difference) > 0 ? "+" : ""}
                      {formatMoney(s.cash_difference, currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
