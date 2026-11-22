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

export const getAuthContext = cache(async () => {
  const { isConfigured } = getSupabaseEnv();
  if (!isConfigured) {
    return { isConfigured: false as const, profile: null, settings: null };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { isConfigured: false as const, profile: null, settings: null };
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  const claimsEmail = (claimsData?.claims?.email as string | undefined) ?? "";

  if (!userId) {
    return { isConfigured: true as const, profile: null, settings: null };
  }

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, is_active")
      .eq("id", userId)
      .single(),
    supabase
      .from("shop_settings")
      .select("*")
      .eq("id", 1)
      .single(),
  ]);

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
    settings: (settings as ShopSettings | null) ?? {
      id: 1,
      shop_name: "Tà Ơi Coffee",
      address: "",
      phone: "",
      currency_code: "LAK",
      currency_symbol: "₭",
      qr_image_url: "",
      bank_info: "",
    },
  };
});

export async function requireRouteAccess(pathname: string) {
  const ctx = await getAuthContext();
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
  return {
    profile: ctx.profile,
    settings: ctx.settings!,
  };
}
