import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentMethod } from "./types";

export interface CartTopping {
  id: string;
  name: string;
  price: number;
}

export interface CartItemInput {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  toppings: CartTopping[];
  note: string;
}

async function computeNeededByIngredient(
  supabase: SupabaseClient,
  items: CartItemInput[]
): Promise<Map<string, number>> {
  const neededByIngredient = new Map<string, number>();
  const { data: recipes } = await supabase
    .from("recipes")
    .select("product_id, variant_id, topping_id, ingredient_id, quantity_required");

  if (!recipes || recipes.length === 0) return neededByIngredient;

  for (const item of items) {
    const variantRecipes = item.variantId
      ? recipes.filter(
          (r) => r.product_id === item.productId && r.variant_id === item.variantId
        )
      : [];
    const productRecipes =
      variantRecipes.length > 0
        ? variantRecipes
        : recipes.filter(
            (r) => r.product_id === item.productId && r.variant_id === null
          );

    for (const r of productRecipes) {
      const prev = neededByIngredient.get(r.ingredient_id) ?? 0;
      neededByIngredient.set(
        r.ingredient_id,
        prev + Number(r.quantity_required) * item.quantity
      );
    }

    for (const top of item.toppings) {
      const topRecipes = recipes.filter((r) => r.topping_id === top.id);
      for (const r of topRecipes) {
        const prev = neededByIngredient.get(r.ingredient_id) ?? 0;
        neededByIngredient.set(
          r.ingredient_id,
          prev + Number(r.quantity_required) * item.quantity
        );
      }
    }
  }

  return neededByIngredient;
}

async function applyIngredientDeltas(
  supabase: SupabaseClient,
  deltas: Map<string, number>,
  params: {
    movementType: "sale_deduction" | "manual_adjust";
    orderId: string;
    note: string;
    userId: string;
  }
) {
  if (deltas.size === 0) return;

  const ingIds = Array.from(deltas.keys());
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, current_stock, avg_unit_cost")
    .in("id", ingIds);

  if (!ingredients || ingredients.length === 0) return;

  const nowIso = new Date().toISOString();
  const movements: {
    ingredient_id: string;
    movement_type: "sale_deduction" | "manual_adjust";
    quantity_change: number;
    stock_after: number;
    unit_cost: number;
    reference_id: string;
    note: string;
    created_by: string;
  }[] = [];

  await Promise.all(
    ingredients.map(async (ing) => {
      const delta = deltas.get(ing.id) ?? 0;
      if (delta === 0) return;

      // Prefer atomic DB RPC when migration_production_hardening.sql is applied
      const { data: rpcAfter, error: rpcErr } = await supabase.rpc(
        "adjust_ingredient_stock",
        { p_ingredient_id: ing.id, p_delta: delta }
      );

      let nextStock: number;
      if (!rpcErr && rpcAfter !== null && rpcAfter !== undefined) {
        nextStock = Number(rpcAfter);
      } else {
        nextStock = Number(ing.current_stock) + delta;
        await supabase
          .from("ingredients")
          .update({ current_stock: nextStock, updated_at: nowIso })
          .eq("id", ing.id);
      }

      movements.push({
        ingredient_id: ing.id,
        movement_type: params.movementType,
        quantity_change: delta,
        stock_after: nextStock,
        unit_cost: Number(ing.avg_unit_cost ?? 0),
        reference_id: params.orderId,
        note: params.note,
        created_by: params.userId,
      });
    })
  );

  if (movements.length > 0) {
    await supabase.from("stock_movements").insert(movements);
  }
}

async function applyShiftSalesDelta(
  supabase: SupabaseClient,
  shiftId: string,
  paymentMethod: PaymentMethod,
  signedAmount: number
) {
  if (!shiftId || signedAmount === 0) return;

  const cashDelta = paymentMethod === "cash" ? signedAmount : 0;
  const qrDelta = paymentMethod === "qr_transfer" ? signedAmount : 0;
  const otherDelta =
    paymentMethod !== "cash" && paymentMethod !== "qr_transfer"
      ? signedAmount
      : 0;

  const { error: rpcErr } = await supabase.rpc("adjust_shift_totals", {
    p_shift_id: shiftId,
    p_cash_delta: cashDelta,
    p_qr_delta: qrDelta,
    p_other_delta: otherDelta,
    p_petty_delta: 0,
  });

  if (!rpcErr) return;

  // Fallback for setups prior to migration_production_hardening.sql
  const { data: shift } = await supabase
    .from("shifts")
    .select(
      "id, opening_cash, total_cash_sales, total_qr_sales, total_other_sales, total_petty_expenses"
    )
    .eq("id", shiftId)
    .eq("status", "open")
    .maybeSingle();

  if (shift) {
    const cashSales = Math.max(0, Number(shift.total_cash_sales ?? 0) + cashDelta);
    const qrSales = Math.max(0, Number(shift.total_qr_sales ?? 0) + qrDelta);
    const otherSales = Math.max(0, Number(shift.total_other_sales ?? 0) + otherDelta);
    const expectedCash =
      Number(shift.opening_cash ?? 0) +
      cashSales -
      Number(shift.total_petty_expenses ?? 0);

    await supabase
      .from("shifts")
      .update({
        total_cash_sales: cashSales,
        total_qr_sales: qrSales,
        total_other_sales: otherSales,
        expected_cash: expectedCash,
      })
      .eq("id", shift.id);
  }
}

/**
 * Deducts ingredient stock based on product/variant/topping recipes when an order
 * is finalized/paid, and updates the active shift's cash/QR/other totals.
 */
export async function deductStockAndSyncShift(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    orderNumber?: number;
    items: CartItemInput[];
    paymentMethod: PaymentMethod;
    totalAmount: number;
    shiftId: string | null;
    userId: string;
  }
) {
  const { orderId, orderNumber, items, paymentMethod, totalAmount, shiftId, userId } =
    params;

  const needed = await computeNeededByIngredient(supabase, items);
  const deltas = new Map<string, number>();
  for (const [id, qty] of needed.entries()) {
    if (qty > 0) deltas.set(id, -qty);
  }

  await Promise.all([
    applyIngredientDeltas(supabase, deltas, {
      movementType: "sale_deduction",
      orderId,
      note: orderNumber ? `Order #${orderNumber}` : "POS Sale",
      userId,
    }),
    shiftId && totalAmount > 0
      ? applyShiftSalesDelta(supabase, shiftId, paymentMethod, totalAmount)
      : Promise.resolve(),
  ]);
}

/**
 * Reverses ingredient stock deduction and shift sales totals when an Admin
 * cancels a previously PAID order (fallback when cancel_order_atomic RPC is unavailable).
 */
export async function reverseStockAndShift(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    orderNumber?: number;
    items: CartItemInput[];
    paymentMethod: PaymentMethod;
    totalAmount: number;
    shiftId: string | null;
    userId: string;
  }
) {
  const { orderId, orderNumber, items, paymentMethod, totalAmount, shiftId, userId } =
    params;

  const needed = await computeNeededByIngredient(supabase, items);
  const restoreDeltas = new Map<string, number>();
  for (const [id, qty] of needed.entries()) {
    if (qty > 0) restoreDeltas.set(id, qty);
  }

  await Promise.all([
    applyIngredientDeltas(supabase, restoreDeltas, {
      movementType: "manual_adjust",
      orderId,
      note: orderNumber ? `Cancel Order #${orderNumber}` : "Cancel Paid Order",
      userId,
    }),
    shiftId && totalAmount > 0
      ? applyShiftSalesDelta(supabase, shiftId, paymentMethod, -totalAmount)
      : Promise.resolve(),
  ]);
}
