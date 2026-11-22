import { AppShell } from "@/components/AppShell";
import { ModuleGuide } from "@/components/ModuleGuide";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServerI18n } from "@/lib/i18n/server";
import {
  ExpensesClient,
  type ExpenseRow,
  type RecurringExpenseRow,
} from "./ExpensesClient";

export default async function ExpensesPage() {
  const supabase = await createClient();

  const [{ profile, settings }, { t }, expRes, recRes] = await Promise.all([
    requireRouteAccess("/expenses"),
    getServerI18n(),
    supabase
      ? supabase
          .from("expenses")
          .select("*")
          .order("expense_date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    supabase
      ? supabase
          .from("recurring_expenses")
          .select("*")
          .eq("is_active", true)
          .order("next_due_date", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14532D]">
            {t.expenses.title}
          </h1>
          <p className="text-sm sm:text-base font-medium text-[#2F6844]">
            {t.expenses.subtitle}
          </p>
        </div>
        <ModuleGuide guideKey="expenses" />
        <ExpensesClient
          profile={profile}
          currencyCode={settings.currency_code}
          initialExpenses={(expRes.data as ExpenseRow[]) ?? []}
          initialRecurring={(recRes.data as RecurringExpenseRow[]) ?? []}
        />
      </div>
    </AppShell>
  );
}
