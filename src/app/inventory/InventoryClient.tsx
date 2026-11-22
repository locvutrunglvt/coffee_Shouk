"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeVN, formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import { localizeName } from "@/lib/i18n/catalogTranslator";
import type { UserProfile } from "@/lib/auth";
import type { ProductRow, ToppingRow, VariantRow } from "@/app/menu/MenuClient";
import {
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  Plus,
  Trash2,
} from "lucide-react";

export interface IngredientRow {
  id: string;
  name: string;
  sku: string;
  purchase_unit: string;
  base_unit: string;
  conversion_rate: number;
  current_stock: number;
  min_stock_alert: number;
  avg_unit_cost: number;
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string;
  address: string;
}

export interface RecipeRow {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  topping_id: string | null;
  ingredient_id: string;
  quantity_required: number;
}

export interface ImportHistoryRow {
  id: string;
  import_code: string;
  import_date: string;
  total_amount: number;
  note: string;
  suppliers: { name: string } | null;
}

export interface StockMovementRow {
  id: string;
  ingredient_id: string;
  movement_type:
    | "import"
    | "sale_deduction"
    | "stock_take_adjust"
    | "waste"
    | "manual_adjust";
  quantity_change: number;
  stock_after: number;
  unit_cost: number;
  note: string;
  created_at: string;
  ingredients: { name: string; base_unit: string } | null;
}

interface InventoryClientProps {
  profile: UserProfile;
  currencyCode: string;
  initialIngredients: IngredientRow[];
  initialSuppliers: SupplierRow[];
  initialImports: ImportHistoryRow[];
  initialMovements: StockMovementRow[];
  initialRecipes: RecipeRow[];
  products: ProductRow[];
  variants: VariantRow[];
  toppings: ToppingRow[];
}

export function InventoryClient({
  profile,
  currencyCode,
  initialIngredients,
  initialSuppliers,
  initialImports,
  initialMovements,
  initialRecipes,
  products,
  variants,
  toppings,
}: InventoryClientProps) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<
    "stock" | "import" | "recipes" | "movements" | "suppliers"
  >("stock");

  const [ingredients, setIngredients] = useState(initialIngredients);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [imports, setImports] = useState(initialImports);
  const [movements, setMovements] = useState(initialMovements);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [notice, setNotice] = useState<string | null>(null);

  // Add Ingredient form
  const [ingName, setIngName] = useState("");
  const [ingSku, setIngSku] = useState("");
  const [ingPurchaseUnit, setIngPurchaseUnit] = useState("Bịch 1kg");
  const [ingBaseUnit, setIngBaseUnit] = useState("g");
  const [ingRate, setIngRate] = useState("1000");
  const [ingMinAlert, setIngMinAlert] = useState("500");

  // Import Receipt form
  const [impSupplierId, setImpSupplierId] = useState("");
  const [impDate, setImpDate] = useState(new Date().toISOString().slice(0, 10));
  const [impNote, setImpNote] = useState("");
  const [impLines, setImpLines] = useState<
    { ingredientId: string; qty: string; price: string }[]
  >([
    {
      ingredientId: initialIngredients[0]?.id ?? "",
      qty: "1",
      price: "",
    },
  ]);
  const [savingImport, setSavingImport] = useState(false);

  // Recipe Builder
  const [recipeTargetType, setRecipeTargetType] = useState<"product" | "topping">(
    "product"
  );
  const [recipeProductId, setRecipeProductId] = useState(products[0]?.id ?? "");
  const [recipeVariantId, setRecipeVariantId] = useState<string>("");
  const [recipeToppingId, setRecipeToppingId] = useState(toppings[0]?.id ?? "");
  const [recipeIngId, setRecipeIngId] = useState(initialIngredients[0]?.id ?? "");
  const [recipeQty, setRecipeQty] = useState("20");

  // Supplier form
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supAddress, setSupAddress] = useState("");

  async function refreshMovements() {
    const supabase = createClient();
    const { data } = await supabase
      .from("stock_movements")
      .select(
        "id, ingredient_id, movement_type, quantity_change, stock_after, unit_cost, note, created_at, ingredients(name, base_unit)"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setMovements(data as unknown as StockMovementRow[]);
  }

  async function handleAddIngredient(e: React.FormEvent) {
    e.preventDefault();
    if (!ingName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        name: ingName.trim(),
        sku: ingSku.trim(),
        purchase_unit: ingPurchaseUnit.trim() || "Kg",
        base_unit: ingBaseUnit.trim() || "g",
        conversion_rate: Math.max(0.0001, Number(ingRate) || 1),
        min_stock_alert: Number(ingMinAlert) || 0,
      })
      .select()
      .single();

    if (!error && data) {
      setIngredients((prev) => [...prev, data as IngredientRow]);
      setIngName("");
      setIngSku("");
      setNotice(t.common.success);
    }
  }

  async function handleSaveImport(e: React.FormEvent) {
    e.preventDefault();
    const validLines = impLines.filter(
      (l) => l.ingredientId && Number(l.qty) > 0
    );
    if (validLines.length === 0) return;

    setSavingImport(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const ingMap = new Map(ingredients.map((i) => [i.id, i]));

      const computedLines = validLines.map((l) => {
        const ing = ingMap.get(l.ingredientId)!;
        const purchaseQty = Number(l.qty);
        const purchaseUnitPrice = Number(l.price) || 0;
        const baseQty = purchaseQty * Number(ing.conversion_rate);
        const lineTotal = purchaseQty * purchaseUnitPrice;
        return { ing, purchaseQty, purchaseUnitPrice, baseQty, lineTotal };
      });

      const totalImportAmount = computedLines.reduce(
        (sum, x) => sum + x.lineTotal,
        0
      );

      const { data: impHeader, error: impErr } = await supabase
        .from("stock_imports")
        .insert({
          supplier_id: impSupplierId || null,
          import_code: `IMP-${Date.now().toString().slice(-6)}`,
          import_date: impDate,
          total_amount: totalImportAmount,
          payment_status: "paid",
          note: impNote.trim(),
          created_by: profile.id,
        })
        .select("id, import_code, import_date, total_amount, note, suppliers(name)")
        .single();

      if (impErr || !impHeader) throw impErr;

      await supabase.from("stock_import_items").insert(
        computedLines.map((x) => ({
          import_id: impHeader.id,
          ingredient_id: x.ing.id,
          purchase_quantity: x.purchaseQty,
          purchase_unit_price: x.purchaseUnitPrice,
          base_quantity: x.baseQty,
          line_total: x.lineTotal,
        }))
      );

      // Update each ingredient stock + weighted average unit cost
      const updatedIngredients = [...ingredients];
      for (const x of computedLines) {
        const idx = updatedIngredients.findIndex((i) => i.id === x.ing.id);
        const currentIng = updatedIngredients[idx];
        const oldStock = Math.max(0, Number(currentIng.current_stock));
        const oldAvg = Number(currentIng.avg_unit_cost);
        const nextStock = Number(currentIng.current_stock) + x.baseQty;
        const denom = oldStock + x.baseQty;
        const nextAvgCost =
          denom > 0 ? (oldStock * oldAvg + x.lineTotal) / denom : oldAvg;

        await supabase
          .from("ingredients")
          .update({
            current_stock: nextStock,
            avg_unit_cost: nextAvgCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", x.ing.id);

        await supabase.from("stock_movements").insert({
          ingredient_id: x.ing.id,
          movement_type: "import",
          quantity_change: x.baseQty,
          stock_after: nextStock,
          unit_cost: x.lineTotal / x.baseQty,
          reference_id: impHeader.id,
          note: impNote.trim() || impHeader.import_code,
          created_by: profile.id,
        });

        updatedIngredients[idx] = {
          ...currentIng,
          current_stock: nextStock,
          avg_unit_cost: nextAvgCost,
        };
      }

      setIngredients(updatedIngredients);
      setImports((prev) => [impHeader as unknown as ImportHistoryRow, ...prev]);
      setImpNote("");
      setImpLines([
        {
          ingredientId: ingredients[0]?.id ?? "",
          qty: "1",
          price: "",
        },
      ]);
      setNotice(t.common.success);
      await refreshMovements();
    } finally {
      setSavingImport(false);
    }
  }

  async function handleAddRecipeLine(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeIngId || Number(recipeQty) <= 0) return;
    const supabase = createClient();

    const payload: {
      product_id: string | null;
      variant_id: string | null;
      topping_id: string | null;
      ingredient_id: string;
      quantity_required: number;
    } =
      recipeTargetType === "product"
        ? {
            product_id: recipeProductId,
            variant_id: recipeVariantId || null,
            topping_id: null,
            ingredient_id: recipeIngId,
            quantity_required: Number(recipeQty),
          }
        : {
            product_id: null,
            variant_id: null,
            topping_id: recipeToppingId,
            ingredient_id: recipeIngId,
            quantity_required: Number(recipeQty),
          };

    const { data, error } = await supabase
      .from("recipes")
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      setRecipes((prev) => [...prev, data as RecipeRow]);
    }
  }

  async function deleteRecipeLine(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (!error) setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name: supName.trim(),
        phone: supPhone.trim(),
        address: supAddress.trim(),
      })
      .select()
      .single();
    if (!error && data) {
      setSuppliers((prev) => [...prev, data as SupplierRow]);
      setSupName("");
      setSupPhone("");
      setSupAddress("");
    }
  }

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const totalStockValue = ingredients.reduce(
    (sum, i) =>
      sum + Math.max(0, Number(i.current_stock)) * Number(i.avg_unit_cost),
    0
  );

  // Import total preview
  const importTotalPreview = impLines.reduce(
    (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0),
    0
  );

  // Recipe filter
  const productVariants = variants.filter(
    (v) => v.product_id === recipeProductId && v.is_active
  );
  const currentRecipeLines =
    recipeTargetType === "product"
      ? recipes.filter(
          (r) =>
            r.product_id === recipeProductId &&
            (recipeVariantId
              ? r.variant_id === recipeVariantId
              : r.variant_id === null)
        )
      : recipes.filter((r) => r.topping_id === recipeToppingId);

  const estimatedCogs = currentRecipeLines.reduce((sum, r) => {
    const ing = ingMap.get(r.ingredient_id);
    return sum + Number(r.quantity_required) * Number(ing?.avg_unit_cost ?? 0);
  }, 0);

  const targetSellPrice =
    recipeTargetType === "product"
      ? Number(
          productVariants.find((v) => v.id === recipeVariantId)?.price ??
            products.find((p) => p.id === recipeProductId)?.base_price ??
            0
        )
      : Number(toppings.find((tp) => tp.id === recipeToppingId)?.price ?? 0);

  const grossMarginPct =
    targetSellPrice > 0
      ? ((targetSellPrice - estimatedCogs) / targetSellPrice) * 100
      : 0;

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-[#CDE9D5]">
        {(
          [
            ["stock", t.inventory.stockTab],
            ["import", t.inventory.importTab],
            ["recipes", t.inventory.recipesTab],
            ["movements", t.inventory.movementsTab],
            ["suppliers", t.inventory.suppliersTab],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm sm:text-base font-medium cursor-pointer ${
              tab === k
                ? "bg-[#16A34A] text-white"
                : "text-[#1E4D31] hover:bg-[#EAFBF0]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: CURRENT STOCK */}
      {tab === "stock" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card-3d rounded-2xl p-4">
              <p className="text-xs text-[#2F6844]">{t.inventory.stockValue}</p>
              <p className="text-xl font-bold text-[#14532D] mt-1">
                {formatMoney(totalStockValue, currencyCode)}
              </p>
            </div>
            <div className="card-3d rounded-2xl p-4">
              <p className="text-xs text-[#2F6844]">{t.dashboard.lowStockTitle}</p>
              <p className="text-xl font-bold text-red-700 mt-1">
                {
                  ingredients.filter(
                    (i) => Number(i.current_stock) <= Number(i.min_stock_alert)
                  ).length
                }
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddIngredient}
            className="card-3d rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-bold text-sm text-[#14532D]">
              {t.inventory.addIngredient}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                required
                value={ingName}
                onChange={(e) => setIngName(e.target.value)}
                placeholder={t.inventory.ingredientName}
                className="lg:col-span-2 px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="text"
                value={ingPurchaseUnit}
                onChange={(e) => setIngPurchaseUnit(e.target.value)}
                placeholder={t.inventory.purchaseUnit}
                className="px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="text"
                value={ingBaseUnit}
                onChange={(e) => setIngBaseUnit(e.target.value)}
                placeholder={t.inventory.baseUnit}
                className="px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="number"
                step="any"
                min="0.01"
                value={ingRate}
                onChange={(e) => setIngRate(e.target.value)}
                placeholder={t.inventory.conversionRate}
                title={t.inventory.conversionRate}
                className="px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="number"
                min="0"
                value={ingMinAlert}
                onChange={(e) => setIngMinAlert(e.target.value)}
                placeholder={t.inventory.minStockAlert}
                title={t.inventory.minStockAlert}
                className="px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.inventory.addIngredient}</span>
            </button>
          </form>

          <div className="card-3d rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                  <th className="py-2 pr-3">{t.inventory.ingredientName}</th>
                  <th className="py-2 pr-3">{t.inventory.currentStock}</th>
                  <th className="py-2 pr-3">{t.inventory.purchaseUnit}</th>
                  <th className="py-2 pr-3">{t.inventory.avgUnitCost}</th>
                  <th className="py-2 pr-3">{t.inventory.stockValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDF3E4]">
                {ingredients.map((ing) => {
                  const isLow =
                    Number(ing.current_stock) <= Number(ing.min_stock_alert);
                  const equivPurchase =
                    Number(ing.conversion_rate) > 0
                      ? Number(ing.current_stock) / Number(ing.conversion_rate)
                      : 0;
                  return (
                    <tr key={ing.id}>
                      <td className="py-3 pr-3 font-semibold text-[#14532D]">
                        {ing.name}
                        {isLow && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px]">
                            <AlertTriangle className="w-3 h-3" />
                            {t.inventory.lowStockBadge}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-bold">
                        {Number(ing.current_stock).toLocaleString("vi-VN")}{" "}
                        {ing.base_unit}
                      </td>
                      <td className="py-3 pr-3 text-[#2F6844]">
                        ≈ {equivPurchase.toFixed(2)} {ing.purchase_unit}
                      </td>
                      <td className="py-3 pr-3">
                        {formatMoney(ing.avg_unit_cost, currencyCode)}/{ing.base_unit}
                      </td>
                      <td className="py-3 pr-3 font-semibold">
                        {formatMoney(
                          Math.max(0, Number(ing.current_stock)) *
                            Number(ing.avg_unit_cost),
                          currencyCode
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

      {/* TAB 2: STOCK IMPORT */}
      {tab === "import" && (
        <div className="space-y-5">
          <form
            onSubmit={handleSaveImport}
            className="card-3d rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2 font-bold text-sm text-[#14532D]">
              <PackagePlus className="w-5 h-5 text-[#15803D]" />
              <h2>{t.inventory.newImportTitle}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.inventory.supplier}
                </label>
                <select
                  value={impSupplierId}
                  onChange={(e) => setImpSupplierId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                >
                  <option value="">{t.inventory.noSupplier}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.inventory.importDate}
                </label>
                <input
                  type="date"
                  required
                  value={impDate}
                  onChange={(e) => setImpDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.common.note}
                </label>
                <input
                  type="text"
                  value={impNote}
                  onChange={(e) => setImpNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
            </div>

            <div className="space-y-2">
              {impLines.map((line, idx) => {
                const ing = ingMap.get(line.ingredientId);
                const converted =
                  ing && Number(line.qty) > 0
                    ? Number(line.qty) * Number(ing.conversion_rate)
                    : 0;
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-[#F2FBF4] p-2.5 rounded-xl border border-[#CDE9D5]"
                  >
                    <select
                      value={line.ingredientId}
                      onChange={(e) =>
                        setImpLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, ingredientId: e.target.value } : x
                          )
                        )
                      }
                      className="sm:col-span-4 px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5] bg-white"
                    >
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.purchase_unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={line.qty}
                      onChange={(e) =>
                        setImpLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, qty: e.target.value } : x
                          )
                        )
                      }
                      placeholder={t.inventory.purchaseQty}
                      className="sm:col-span-2 px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5] bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      value={line.price}
                      onChange={(e) =>
                        setImpLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, price: e.target.value } : x
                          )
                        )
                      }
                      placeholder={`${t.inventory.purchaseUnitPrice} (${currencyCode})`}
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5] bg-white"
                    />
                    <span className="sm:col-span-2 text-[11px] font-semibold text-emerald-700">
                      +{converted} {ing?.base_unit ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setImpLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="sm:col-span-1 p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer justify-self-end"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setImpLines((prev) => [
                    ...prev,
                    {
                      ingredientId: ingredients[0]?.id ?? "",
                      qty: "1",
                      price: "",
                    },
                  ])
                }
                className="text-xs font-semibold text-[#15803D] hover:underline cursor-pointer"
              >
                + {t.inventory.addLine}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#DDF3E4]">
              <div className="text-base font-extrabold text-[#14532D]">
                {t.inventory.totalImport}:{" "}
                <span className="text-[#15803D]">
                  {formatMoney(importTotalPreview, currencyCode)}
                </span>
              </div>
              <button
                type="submit"
                disabled={savingImport || ingredients.length === 0}
                className="px-4 py-2.5 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingImport ? t.common.saving : t.inventory.saveImportBtn}
              </button>
            </div>
          </form>

          <div className="card-3d rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm text-[#14532D]">
              {t.inventory.importHistory}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                    <th className="py-2 pr-3">{t.common.date}</th>
                    <th className="py-2 pr-3">{t.inventory.supplier}</th>
                    <th className="py-2 pr-3">{t.common.total}</th>
                    <th className="py-2 pr-3">{t.common.note}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDF3E4]">
                  {imports.map((imp) => (
                    <tr key={imp.id}>
                      <td className="py-2.5 pr-3">{imp.import_date}</td>
                      <td className="py-2.5 pr-3">
                        {imp.suppliers?.name ?? t.inventory.noSupplier}
                      </td>
                      <td className="py-2.5 pr-3 font-bold text-[#14532D]">
                        {formatMoney(imp.total_amount, currencyCode)}
                      </td>
                      <td className="py-2.5 pr-3 text-[#2F6844]">{imp.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RECIPES */}
      {tab === "recipes" && (
        <div className="card-3d rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRecipeTargetType("product")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                recipeTargetType === "product"
                  ? "bg-[#16A34A] text-white border-[#16A34A]"
                  : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
              }`}
            >
              {t.menu.productsTab}
            </button>
            <button
              type="button"
              onClick={() => setRecipeTargetType("topping")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                recipeTargetType === "topping"
                  ? "bg-[#16A34A] text-white border-[#16A34A]"
                  : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
              }`}
            >
              {t.menu.toppingsTab}
            </button>
          </div>

          {recipeTargetType === "product" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.inventory.selectProductRecipe}
                </label>
                <select
                  value={recipeProductId}
                  onChange={(e) => {
                    setRecipeProductId(e.target.value);
                    setRecipeVariantId("");
                  }}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {localizeName(p, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.inventory.selectVariantRecipe}
                </label>
                <select
                  value={recipeVariantId}
                  onChange={(e) => setRecipeVariantId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                >
                  <option value="">{t.inventory.allVariants}</option>
                  {productVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({formatMoney(v.price, currencyCode)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-base font-extrabold text-[#14532D] mb-1">
                {t.menu.toppingName}
              </label>
              <select
                value={recipeToppingId}
                onChange={(e) => setRecipeToppingId(e.target.value)}
                className="w-full max-w-sm px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
              >
                {toppings.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {localizeName(tp, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-[#2F6844]">{t.inventory.recipeHint}</p>

          <form
            onSubmit={handleAddRecipeLine}
            className="flex flex-wrap gap-2 items-center"
          >
            <select
              value={recipeIngId}
              onChange={(e) => setRecipeIngId(e.target.value)}
              className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.base_unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              min="0.01"
              value={recipeQty}
              onChange={(e) => setRecipeQty(e.target.value)}
              placeholder={t.inventory.qtyRequired}
              className="w-36 px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold cursor-pointer"
            >
              + {t.inventory.addRecipeIngredient}
            </button>
          </form>

          <div className="divide-y divide-[#DDF3E4] text-xs">
            {currentRecipeLines.map((r) => {
              const ing = ingMap.get(r.ingredient_id);
              const lineCost =
                Number(r.quantity_required) * Number(ing?.avg_unit_cost ?? 0);
              return (
                <div
                  key={r.id}
                  className="py-2.5 flex items-center justify-between gap-2"
                >
                  <span>
                    <strong>{ing?.name}</strong>: {r.quantity_required}{" "}
                    {ing?.base_unit}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#2F6844]">
                      {formatMoney(lineCost, currencyCode)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteRecipeLine(r.id)}
                      className="text-red-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5] flex flex-wrap justify-between gap-3 text-xs">
            <span>
              {t.inventory.estimatedCost}:{" "}
              <strong className="text-[#14532D]">
                {formatMoney(estimatedCogs, currencyCode)}
              </strong>
            </span>
            <span>
              {t.inventory.grossMargin}:{" "}
              <strong className="text-emerald-700">
                {grossMarginPct.toFixed(1)}%
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: MOVEMENTS LEDGER */}
      {tab === "movements" && (
        <div className="card-3d rounded-2xl p-5 space-y-3 overflow-x-auto">
          <h2 className="font-bold text-sm text-[#14532D]">
            {t.inventory.movementsTitle}
          </h2>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                <th className="py-2 pr-3">{t.common.date}</th>
                <th className="py-2 pr-3">{t.inventory.ingredientName}</th>
                <th className="py-2 pr-3">{t.common.status}</th>
                <th className="py-2 pr-3">{t.common.quantity}</th>
                <th className="py-2 pr-3">{t.inventory.currentStock}</th>
                <th className="py-2 pr-3">{t.common.note}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDF3E4]">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 text-[#2F6844]">
                    {formatDateTimeVN(m.created_at)}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-[#14532D]">
                    {m.ingredients?.name}
                  </td>
                  <td className="py-2 pr-3">
                    {t.inventory.movementTypes[m.movement_type]}
                  </td>
                  <td
                    className={`py-2 pr-3 font-bold ${
                      Number(m.quantity_change) >= 0
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {Number(m.quantity_change) > 0 ? "+" : ""}
                    {m.quantity_change} {m.ingredients?.base_unit}
                  </td>
                  <td className="py-2 pr-3">
                    {m.stock_after} {m.ingredients?.base_unit}
                  </td>
                  <td className="py-2 pr-3 text-[#2F6844]">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: SUPPLIERS */}
      {tab === "suppliers" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <form
            onSubmit={handleAddSupplier}
            className="card-3d rounded-2xl p-5 space-y-3 h-fit"
          >
            <h2 className="font-bold text-sm text-[#14532D]">
              {t.inventory.addSupplier}
            </h2>
            <input
              type="text"
              required
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder={t.inventory.supplierName}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
            <input
              type="text"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder={t.inventory.supplierPhone}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
            <input
              type="text"
              value={supAddress}
              onChange={(e) => setSupAddress(e.target.value)}
              placeholder={t.inventory.supplierAddress}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold cursor-pointer"
            >
              {t.common.add}
            </button>
          </form>

          <div className="card-3d rounded-2xl p-5 space-y-2">
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="py-2 border-b border-[#DDF3E4] last:border-0 text-xs"
              >
                <p className="font-bold text-[#14532D]">{s.name}</p>
                <p className="text-[#2F6844]">
                  {s.phone} {s.address ? `• ${s.address}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
