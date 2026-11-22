import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import {
  MenuClient,
  type CategoryRow,
  type ProductRow,
  type TableRow,
  type ToppingRow,
  type VariantRow,
} from "./MenuClient";

export default async function MenuPage() {
  const supabase = await createClient();

  const [{ profile, settings }, { t }, catRes, prodRes, varRes, topRes, tableRes] =
    await Promise.all([
      requireRouteAccess("/menu"),
      getServerI18n(),
      supabase
        ? supabase
            .from("categories")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase.from("product_variants").select("*").eq("is_active", true)
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("toppings")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from("dining_tables")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.menu.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.menu.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="menu" />
        <MenuClient
          currencyCode={settings.currency_code}
          userRole={profile.role}
          initialCategories={(catRes.data as CategoryRow[]) ?? []}
          initialProducts={(prodRes.data as ProductRow[]) ?? []}
          initialVariants={(varRes.data as VariantRow[]) ?? []}
          initialToppings={(topRes.data as ToppingRow[]) ?? []}
          initialTables={(tableRes.data as TableRow[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
