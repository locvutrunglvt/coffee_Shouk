import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { canAccessRoute, ROLE_STYLE, type UserRole } from "@/lib/rbac";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
}

export interface ShopSettings {
  id: number;
  shop_name: string;
  address: string;
  phone: string;
  currency_code: string;
  currency_symbol: string;
  qr_image_url: string;
  bank_info: string;
  qr_mode?: "image" | "vietqr" | "emvco";
  vietqr_bank_id?: string;
  vietqr_account_no?: string;
  vietqr_account_name?: string;
  emvco_base_qr?: string;
}

const SETTINGS_LITE_COLUMNS =
  "id, shop_name, address, phone, currency_code, currency_symbol, bank_info, qr_mode, vietqr_bank_id, vietqr_account_no, vietqr_account_name";

const DEFAULT_SETTINGS: ShopSettings = {
  id: 1,
  shop_name: "Ta Oi Coffee",
  address: "",
  phone: "",
  currency_code: "LAK",
  currency_symbol: "₭",
  qr_image_url: "",
  bank_info: "",
};

const fetchAuthCore = cache(async () => {
  const { isConfigured } = getSupabaseEnv();
  if (!isConfigured) {
    return { isConfigured: false as const, profile: null, settings: null };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { isConfigured: false as const, profile: null, settings: null };
  }

  const [{ data: claimsData }, settingsRes] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("shop_settings")
      .select(SETTINGS_LITE_COLUMNS)
      .eq("id", 1)
      .single(),
  ]);

  const userId = claimsData?.claims?.sub as string | undefined;
  const claimsEmail = (claimsData?.claims?.email as string | undefined) ?? "";

  if (!userId) {
    return { isConfigured: true as const, profile: null, settings: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, is_active")
    .eq("id", userId)
    .single();

  return {
    isConfigured: true as const,
    profile: (profile as UserProfile | null) ?? {
      id: userId,
      full_name: claimsEmail.split("@")[0] || "Staff",
      email: claimsEmail,
      phone: "",
      role: "staff" as UserRole,
      is_active: true,
    },
    settings: (() => {
      const merged = {
        ...DEFAULT_SETTINGS,
        ...(settingsRes.data as Partial<ShopSettings> | null),
      };
      if (merged.shop_name === "Tà Ơi Coffee") {
        merged.shop_name = "Ta Oi Coffee";
      }
      return merged;
    })(),
  };
});

export const getAuthContext = cache(async () => {
  return fetchAuthCore();
});

const fetchSettingsQrExtras = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return { qr_image_url: "", emvco_base_qr: "" };
  const { data } = await supabase
    .from("shop_settings")
    .select("qr_image_url, emvco_base_qr")
    .eq("id", 1)
    .single();
  return {
    qr_image_url: (data?.qr_image_url as string | undefined) ?? "",
    emvco_base_qr: (data?.emvco_base_qr as string | undefined) ?? "",
  };
});

export async function requireRouteAccess(
  pathname: string,
  options?: { includeQr?: boolean }
) {
  const [ctx, qrExtras] = await Promise.all([
    fetchAuthCore(),
    options?.includeQr ? fetchSettingsQrExtras() : Promise.resolve(null),
  ]);

  if (!ctx.isConfigured || !ctx.profile) {
    redirect("/login");
  }
  if (!ctx.profile.is_active) {
    redirect("/unauthorized");
  }
  if (!canAccessRoute(ctx.profile.role, pathname)) {
    if (pathname === "/") {
      redirect(ROLE_STYLE[ctx.profile.role].defaultRoute);
    }
    redirect("/unauthorized");
  }

  const settings = qrExtras
    ? { ...ctx.settings!, ...qrExtras }
    : ctx.settings!;

  return {
    profile: ctx.profile,
    settings,
  };
}
