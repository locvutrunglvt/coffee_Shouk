import { createClient } from "@/lib/supabase/server";
import type { ShopSettings } from "@/lib/auth";
import type {
  CategoryRow,
  ProductRow,
  TableRow,
  ToppingRow,
  VariantRow,
} from "@/app/menu/MenuClient";
import { OrderPublicClient } from "./OrderPublicClient";

export default async function PublicOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const [{ table }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);

  const [settingsRes, catRes, prodRes, varRes, topRes, tableRes] = supabase
    ? await Promise.all([
        supabase.from("shop_settings").select("*").eq("id", 1).single(),
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
      ])
    : [
        { data: null },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

  const settings: ShopSettings = (settingsRes.data as ShopSettings | null) ?? {
    id: 1,
    shop_name: "Tà Ơi Coffee",
    address: "",
    phone: "",
    currency_code: "LAK",
    currency_symbol: "₭",
    qr_image_url: "",
    bank_info: "",
  };

  return (
    <OrderPublicClient
      settings={settings}
      categories={(catRes.data as CategoryRow[]) ?? []}
      products={(prodRes.data as ProductRow[]) ?? []}
      variants={(varRes.data as VariantRow[]) ?? []}
      toppings={(topRes.data as ToppingRow[]) ?? []}
      tables={(tableRes.data as TableRow[]) ?? []}
      initialTableId={table ?? null}
    />
  );
}
