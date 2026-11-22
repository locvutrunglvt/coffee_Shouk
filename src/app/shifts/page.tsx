import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import {
  ShiftsClient,
  type ShiftPettyExpenseRow,
  type ShiftRow,
} from "./ShiftsClient";

export default async function ShiftsPage() {
  const [{ profile, settings }, { t }] = await Promise.all([
    requireRouteAccess("/shifts"),
    getServerI18n(),
  ]);
  const supabase = await createClient();

  const [openRes, closedRes] = supabase
    ? await Promise.all([
        supabase
          .from("shifts")
          .select("*")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("shifts")
          .select("*")
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(15),
      ])
    : [{ data: null }, { data: [] }];

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
          <h1 className="text-xl font-bold text-[#4A2C18]">{t.shifts.title}</h1>
          <p className="text-xs text-[#7B6554]">{t.shifts.subtitle}</p>
        </div>

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
