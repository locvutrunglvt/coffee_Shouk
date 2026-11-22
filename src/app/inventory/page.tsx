import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import {
  InventoryClient,
  type ImportHistoryRow,
  type IngredientRow,
  type RecipeRow,
  type StockMovementRow,
  type SupplierRow,
} from "./InventoryClient";
import type { ProductRow, ToppingRow, VariantRow } from "@/app/menu/MenuClient";

export default async function InventoryPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/inventory"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const [ingRes, supRes, impRes, movRes, recRes, prodRes, varRes, topRes] =
    supabase
      ? await Promise.all([
          supabase
            .from("ingredients")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("suppliers")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("stock_imports")
            .select(
              "id, import_code, import_date, total_amount, note, suppliers(name)"
            )
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("stock_movements")
            .select(
              "id, ingredient_id, movement_type, quantity_change, stock_after, unit_cost, note, created_at, ingredients(name, base_unit)"
            )
            .order("created_at", { ascending: false })
            .limit(50),
          supabase.from("recipes").select("*"),
          supabase
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase.from("product_variants").select("*").eq("is_active", true),
          supabase
            .from("toppings")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true }),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
        ];

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.inventory.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.inventory.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="inventory" />
        <InventoryClient
          profile={profile}
          currencyCode={settings.currency_code}
          initialIngredients={(ingRes.data as IngredientRow[]) ?? []}
          initialSuppliers={(supRes.data as SupplierRow[]) ?? []}
          initialImports={(impRes.data as unknown as ImportHistoryRow[]) ?? []}
          initialMovements={(movRes.data as unknown as StockMovementRow[]) ?? []}
          initialRecipes={(recRes.data as RecipeRow[]) ?? []}
          products={(prodRes.data as ProductRow[]) ?? []}
          variants={(varRes.data as VariantRow[]) ?? []}
          toppings={(topRes.data as ToppingRow[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
