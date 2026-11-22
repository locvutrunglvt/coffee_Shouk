import { AppShell } from "@/components/AppShell";
import { requireRouteAccess, type UserProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/settings"),
    getServerI18n(),
  ]);
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
          <h1 className="text-xl font-bold text-[#4A2C18]">{t.settings.title}</h1>
          <p className="text-xs text-[#7B6554]">{t.settings.subtitle}</p>
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
