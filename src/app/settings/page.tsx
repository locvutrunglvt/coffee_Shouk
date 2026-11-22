import { AppShell } from "@/components/AppShell";
import { requireRouteAccess, type UserProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const { profile, settings } = await requireRouteAccess("/settings");
  const supabase = await createClient();

  const { data: allProfiles } = supabase
    ? await supabase
        .from("profiles")
        .select("id, full_name, email, phone, role, is_active")
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#4A2C18]">
            Cài đặt quán & Phân quyền
          </h1>
          <p className="text-xs text-[#7B6554]">
            Quản lý thông tin cửa hàng, tiền tệ (LAK/VND), QR thanh toán và vai trò nhân viên.
          </p>
        </div>

        <SettingsClient
          initialSettings={settings}
          initialProfiles={(allProfiles as UserProfile[] | null) ?? []}
          currentUserId={profile.id}
        />
      </div>
    </AppShell>
  );
}
