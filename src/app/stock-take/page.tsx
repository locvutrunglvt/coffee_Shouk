import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import type { IngredientRow } from "@/app/inventory/InventoryClient";
import {
  StockTakeClient,
  type StockTakeItemRow,
  type StockTakeRow,
} from "./StockTakeClient";

export default async function StockTakePage() {
  const supabase = await createClient();

  const [{ profile, settings }, { t }, ingRes, draftRes, histRes] =
    await Promise.all([
      requireRouteAccess("/stock-take"),
      getServerI18n(),
      supabase
        ? supabase
            .from("ingredients")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("stock_takes")
            .select("*")
            .eq("status", "draft")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        ? supabase
            .from("stock_takes")
            .select("*")
            .eq("status", "finalized")
            .order("finalized_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

  const draft = (draftRes.data as StockTakeRow | null) ?? null;

  const { data: draftItems } =
    supabase && draft
      ? await supabase
          .from("stock_take_items")
          .select("*, ingredients(name, base_unit)")
          .eq("stock_take_id", draft.id)
      : { data: [] };

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.stockTake.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.stockTake.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="stockTake" />
        <StockTakeClient
          profile={profile}
          currencyCode={settings.currency_code}
          ingredients={(ingRes.data as IngredientRow[]) ?? []}
          initialDraft={draft}
          initialDraftItems={(draftItems as unknown as StockTakeItemRow[]) ?? []}
          initialHistory={(histRes.data as StockTakeRow[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
