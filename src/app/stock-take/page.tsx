import { AppShell } from "@/components/AppShell";
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
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/stock-take"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const [ingRes, draftRes, histRes] = supabase
    ? await Promise.all([
        supabase
          .from("ingredients")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("stock_takes")
          .select("*")
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("stock_takes")
          .select("*")
          .eq("status", "finalized")
          .order("finalized_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: [] }, { data: null }, { data: [] }];

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
          <h1 className="text-xl font-bold text-[#4A2C18]">
            {t.stockTake.title}
          </h1>
          <p className="text-xs text-[#7B6554]">{t.stockTake.subtitle}</p>
        </div>

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
