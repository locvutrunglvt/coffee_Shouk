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

  // 1. Fetch all recipes once
  const { data: recipes } = await supabase
    .from("recipes")
    .select("product_id, variant_id, topping_id, ingredient_id, quantity_required");

  if (recipes && recipes.length > 0) {
    const neededByIngredient = new Map<string, number>();

    for (const item of items) {
      // Check variant-specific recipes first; fallback to product-level (variant_id is null)
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

    if (neededByIngredient.size > 0) {
      const ingIds = Array.from(neededByIngredient.keys());
      const { data: ingredients } = await supabase
        .from("ingredients")
        .select("id, current_stock, avg_unit_cost")
        .in("id", ingIds);

      if (ingredients && ingredients.length > 0) {
        const nowIso = new Date().toISOString();
        const updates: Promise<unknown>[] = [];
        const movements: {
          ingredient_id: string;
          movement_type: "sale_deduction";
          quantity_change: number;
          stock_after: number;
          unit_cost: number;
          reference_id: string;
          note: string;
          created_by: string;
        }[] = [];

        for (const ing of ingredients) {
          const deduct = neededByIngredient.get(ing.id) ?? 0;
          if (deduct <= 0) continue;
          const nextStock = Number(ing.current_stock) - deduct;

          updates.push(
            supabase
              .from("ingredients")
              .update({
                current_stock: nextStock,
                updated_at: nowIso,
              })
              .eq("id", ing.id) as unknown as Promise<unknown>
          );

          movements.push({
            ingredient_id: ing.id,
            movement_type: "sale_deduction",
            quantity_change: -deduct,
            stock_after: nextStock,
            unit_cost: Number(ing.avg_unit_cost ?? 0),
            reference_id: orderId,
            note: orderNumber ? `Order #${orderNumber}` : "POS Sale",
            created_by: userId,
          });
        }

        if (updates.length > 0) {
          await Promise.all([
            ...updates,
            supabase.from("stock_movements").insert(movements),
          ]);
        }
      }
    }
  }

  // 2. Update active open shift totals if linked
  if (shiftId && totalAmount > 0) {
    const { data: shift } = await supabase
      .from("shifts")
      .select(
        "id, opening_cash, total_cash_sales, total_qr_sales, total_other_sales, total_petty_expenses"
      )
      .eq("id", shiftId)
      .eq("status", "open")
      .maybeSingle();

    if (shift) {
      let cashSales = Number(shift.total_cash_sales ?? 0);
      let qrSales = Number(shift.total_qr_sales ?? 0);
      let otherSales = Number(shift.total_other_sales ?? 0);

      if (paymentMethod === "cash") cashSales += totalAmount;
      else if (paymentMethod === "qr_transfer") qrSales += totalAmount;
      else otherSales += totalAmount;

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
}
