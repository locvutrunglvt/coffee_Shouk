"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, getLocalTodayDateStr } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import type { UserProfile } from "@/lib/auth";
import type { IngredientRow } from "@/app/inventory/InventoryClient";
import { CheckCircle2, ClipboardCheck, Plus } from "lucide-react";

export interface StockTakeRow {
  id: string;
  take_date: string;
  status: "draft" | "finalized";
  total_variance_value: number;
  note: string;
  created_at: string;
}

export interface StockTakeItemRow {
  id: string;
  stock_take_id: string;
  ingredient_id: string;
  system_stock: number;
  actual_stock: number;
  difference: number;
  unit_cost: number;
  variance_value: number;
  reason: string;
  ingredients: { name: string; base_unit: string } | null;
}

interface StockTakeClientProps {
  profile: UserProfile;
  currencyCode: string;
  ingredients: IngredientRow[];
  initialDraft: StockTakeRow | null;
  initialDraftItems: StockTakeItemRow[];
  initialHistory: StockTakeRow[];
}

export function StockTakeClient({
  profile,
  currencyCode,
  ingredients,
  initialDraft,
  initialDraftItems,
  initialHistory,
}: StockTakeClientProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<StockTakeRow | null>(initialDraft);
  const [items, setItems] = useState<StockTakeItemRow[]>(initialDraftItems);
  const [history, setHistory] = useState<StockTakeRow[]>(initialHistory);
  const [busy, setBusy] = useState(false);

  async function handleCreateDraft() {
    if (ingredients.length === 0) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: created, error } = await supabase
        .from("stock_takes")
        .insert({
          take_date: getLocalTodayDateStr(),
          status: "draft",
          created_by: profile.id,
        })
        .select()
        .single();

      if (error || !created) throw error;

      const itemsPayload = ingredients.map((ing) => ({
        stock_take_id: created.id,
        ingredient_id: ing.id,
        system_stock: Number(ing.current_stock),
        actual_stock: Number(ing.current_stock),
        difference: 0,
        unit_cost: Number(ing.avg_unit_cost),
        variance_value: 0,
        reason: "",
      }));

      const { data: insertedItems } = await supabase
        .from("stock_take_items")
        .insert(itemsPayload)
        .select("*, ingredients(name, base_unit)");

      setDraft(created as StockTakeRow);
      setItems((insertedItems as unknown as StockTakeItemRow[]) ?? []);
    } finally {
      setBusy(false);
    }
  }

  function updateLocalItem(
    itemId: string,
    actualVal: string,
    reasonVal?: string
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const actual = Number(actualVal) || 0;
        const diff = actual - Number(it.system_stock);
        const val = diff * Number(it.unit_cost);
        return {
          ...it,
          actual_stock: actual,
          difference: diff,
          variance_value: val,
          reason: reasonVal !== undefined ? reasonVal : it.reason,
        };
      })
    );
  }

  async function handleFinalize() {
    if (!draft) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const totalVariance = items.reduce(
        (sum, it) => sum + Number(it.variance_value),
        0
      );

      const nowIso = new Date().toISOString();
      const movementsPayload: {
        ingredient_id: string;
        movement_type: "stock_take_adjust";
        quantity_change: number;
        stock_after: number;
        unit_cost: number;
        reference_id: string;
        note: string;
        created_by: string;
      }[] = [];

      await Promise.all(
        items.map(async (it) => {
          const ops: Promise<unknown>[] = [
            supabase
              .from("stock_take_items")
              .update({
                actual_stock: it.actual_stock,
                difference: it.difference,
                variance_value: it.variance_value,
                reason: it.reason,
              })
              .eq("id", it.id) as unknown as Promise<unknown>,
          ];

          if (it.difference !== 0) {
            ops.push(
              supabase
                .from("ingredients")
                .update({
                  current_stock: it.actual_stock,
                  updated_at: nowIso,
                })
                .eq("id", it.ingredient_id) as unknown as Promise<unknown>
            );
            movementsPayload.push({
              ingredient_id: it.ingredient_id,
              movement_type: "stock_take_adjust",
              quantity_change: it.difference,
              stock_after: it.actual_stock,
              unit_cost: it.unit_cost,
              reference_id: draft.id,
              note: it.reason || draft.take_date,
              created_by: profile.id,
            });
          }

          await Promise.all(ops);
        })
      );

      if (movementsPayload.length > 0) {
        await supabase.from("stock_movements").insert(movementsPayload);
      }

      const { data: finalized } = await supabase
        .from("stock_takes")
        .update({
          status: "finalized",
          total_variance_value: totalVariance,
          finalized_by: profile.id,
          finalized_at: new Date().toISOString(),
        })
        .eq("id", draft.id)
        .select()
        .single();

      if (finalized) {
        setHistory((prev) => [finalized as StockTakeRow, ...prev]);
        setDraft(null);
        setItems([]);
      }
    } finally {
      setBusy(false);
    }
  }

  const totalVariancePreview = items.reduce(
    (sum, it) => sum + Number(it.variance_value),
    0
  );

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
        {t.stockTake.helpNote}
      </div>

      {!draft ? (
        <button
          type="button"
          disabled={busy || ingredients.length === 0}
          onClick={handleCreateDraft}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>{t.stockTake.createBtn}</span>
        </button>
      ) : (
        <div className="card-3d rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-[#14532D]">
              <ClipboardCheck className="w-5 h-5 text-[#15803D]" />
              <span>
                {t.stockTake.activeDraftTitle} ({draft.take_date})
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
              {t.stockTake.draftBadge}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                  <th className="py-2 pr-3">{t.inventory.ingredientName}</th>
                  <th className="py-2 pr-3">{t.stockTake.systemStock}</th>
                  <th className="py-2 pr-3">{t.stockTake.actualStock}</th>
                  <th className="py-2 pr-3">{t.stockTake.difference}</th>
                  <th className="py-2 pr-3">{t.stockTake.varianceValue}</th>
                  <th className="py-2 pr-3">{t.common.note}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDF3E4]">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2.5 pr-3 font-semibold text-[#14532D]">
                      {it.ingredients?.name}
                    </td>
                    <td className="py-2.5 pr-3">
                      {it.system_stock} {it.ingredients?.base_unit}
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="number"
                        step="any"
                        value={it.actual_stock}
                        onChange={(e) => updateLocalItem(it.id, e.target.value)}
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-[#CDE9D5] font-semibold"
                      />
                    </td>
                    <td
                      className={`py-2.5 pr-3 font-bold ${
                        it.difference === 0
                          ? "text-emerald-700"
                          : it.difference < 0
                          ? "text-red-700"
                          : "text-sky-700"
                      }`}
                    >
                      {it.difference > 0 ? "+" : ""}
                      {it.difference} {it.ingredients?.base_unit}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold">
                      {formatMoney(it.variance_value, currencyCode)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="text"
                        value={it.reason}
                        onChange={(e) =>
                          updateLocalItem(
                            it.id,
                            String(it.actual_stock),
                            e.target.value
                          )
                        }
                        placeholder={t.stockTake.reasonPlaceholder}
                        className="w-44 px-2.5 py-1.5 rounded-lg border border-[#CDE9D5]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#DDF3E4]">
            <div className="text-base font-extrabold text-[#14532D]">
              {t.stockTake.varianceValue}:{" "}
              <span
                className={
                  totalVariancePreview < 0 ? "text-red-700" : "text-emerald-700"
                }
              >
                {formatMoney(totalVariancePreview, currencyCode)}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleFinalize}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t.stockTake.finalizeBtn}</span>
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card-3d rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm text-[#14532D]">
          {t.stockTake.historyTitle}
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-[#2F6844]">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                  <th className="py-2 pr-3">{t.common.date}</th>
                  <th className="py-2 pr-3">{t.common.status}</th>
                  <th className="py-2 pr-3">{t.stockTake.varianceValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDF3E4]">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 pr-3">{h.take_date}</td>
                    <td className="py-2.5 pr-3">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                        {t.stockTake.finalizedBadge}
                      </span>
                    </td>
                    <td
                      className={`py-2.5 pr-3 font-bold ${
                        Number(h.total_variance_value) < 0
                          ? "text-red-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(h.total_variance_value, currencyCode)}
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
