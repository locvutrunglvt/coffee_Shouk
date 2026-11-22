import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import { BarClient, type BarOrder } from "./BarClient";

export default async function BarPage() {
  const supabase = await createClient();

  const [{ profile, settings }, { t }, { data }] = await Promise.all([
    requireRouteAccess("/bar"),
    getServerI18n(),
    supabase
      ? supabase
          .from("orders")
          .select(
            "id, order_number, order_type, status, note, created_at, dining_tables(name), order_items(id, product_name, variant_name, quantity, toppings_json, note)"
          )
          .in("status", ["pending", "preparing", "ready"])
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.bar.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.bar.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="bar" />
        <BarClient initialOrders={(data as unknown as BarOrder[]) ?? []} />
      </div>
    </AppShell>
  );
}
