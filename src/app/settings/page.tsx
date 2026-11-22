import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.settings.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.settings.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="settings" />
        <SettingsClient
          initialSettings={settings}
          initialProfiles={(allProfiles as UserProfile[] | null) ?? []}
          currentUserId={profile.id}
        />
      </div>
    </AppShell>
  );
}
