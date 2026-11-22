import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import { BarClient, type BarOrder } from "./BarClient";

export default async function BarPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/bar"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const { data } = supabase
    ? await supabase
        .from("orders")
        .select(
          "id, order_number, order_type, status, note, created_at, dining_tables(name), order_items(id, product_name, variant_name, quantity, toppings_json, note)"
        )
        .in("status", ["pending", "preparing", "ready"])
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#4A2C18]">{t.bar.title}</h1>
          <p className="text-xs text-[#7B6554]">{t.bar.subtitle}</p>
        </div>
        <BarClient initialOrders={(data as unknown as BarOrder[]) ?? []} />
      </div>
    </AppShell>
  );
}
