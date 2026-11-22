import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import {
  ShiftsClient,
  type ShiftPettyExpenseRow,
  type ShiftRow,
} from "./ShiftsClient";

export default async function ShiftsPage() {
  const supabase = await createClient();

  const [{ profile, settings }, { t }, openRes, closedRes] = await Promise.all([
    requireRouteAccess("/shifts"),
    getServerI18n(),
    supabase
      ? supabase
          .from("shifts")
          .select("*")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      ? supabase
          .from("shifts")
          .select("*")
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  const openShift = (openRes.data as ShiftRow | null) ?? null;

  const { data: pettyData } =
    supabase && openShift
      ? await supabase
          .from("expenses")
          .select("id, title, amount, created_at")
          .eq("shift_id", openShift.id)
          .order("created_at", { ascending: false })
      : { data: [] };

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.shifts.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.shifts.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="shifts" />
        <ShiftsClient
          profile={profile}
          currencyCode={settings.currency_code}
          initialOpenShift={openShift}
          initialPettyExpenses={(pettyData as ShiftPettyExpenseRow[]) ?? []}
          initialClosedShifts={(closedRes.data as ShiftRow[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
