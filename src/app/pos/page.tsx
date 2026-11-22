import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import { PosClient } from "./PosClient";
import type {
  CategoryRow,
  ProductRow,
  TableRow,
  ToppingRow,
  VariantRow,
} from "@/app/menu/MenuClient";

export default async function PosPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/pos"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [catRes, prodRes, varRes, topRes, tableRes, shiftRes, ordersRes] = supabase
    ? await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase.from("product_variants").select("*").eq("is_active", true),
        supabase
          .from("toppings")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("dining_tables")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("shifts")
          .select("id")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select(
            "id, order_number, order_type, status, total_amount, payment_method, payment_status, created_at, table_id, dining_tables(name), order_items(product_id, variant_id, product_name, variant_name, quantity, unit_price, toppings_json, line_total, note)"
          )
          .gte("created_at", todayStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(15),
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: null },
        { data: [] },
      ];

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.pos.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.pos.subtitle}
          </p>
        </div>

        <ModuleGuide guideKey="pos" />

        <PosClient
          profile={profile}
          settings={settings}
          categories={(catRes.data as CategoryRow[]) ?? []}
          products={(prodRes.data as ProductRow[]) ?? []}
          variants={(varRes.data as VariantRow[]) ?? []}
          toppings={(topRes.data as ToppingRow[]) ?? []}
          tables={(tableRes.data as TableRow[]) ?? []}
          openShiftId={shiftRes.data?.id ?? null}
          initialRecentOrders={(ordersRes.data as never[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
