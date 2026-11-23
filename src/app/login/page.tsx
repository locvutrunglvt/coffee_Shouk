import Image from "next/image";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getServerI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LoginForm } from "./LoginForm";
import { Sprout } from "lucide-react";

export default async function LoginPage() {
  const { isConfigured } = getSupabaseEnv();
  const { t } = await getServerI18n();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md card-3d rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex justify-end">
          <LanguageSwitcher compact />
        </div>

        <div className="flex flex-col items-center text-center space-y-2.5">
          <Image
            src="/logo-taoi.jpeg"
            alt="Ta Oi Coffee"
            width={88}
            height={88}
            className="w-22 h-22 rounded-2xl object-cover border-2 border-[#86EFAC] shadow-md"
            priority
          />
          <h1 className="text-2xl font-extrabold text-[#14532D] flex items-center gap-2">
            <span>Ta Oi Coffee</span>
            <Sprout className="w-5 h-5 text-[#16A34A]" />
          </h1>
          <p className="text-sm font-medium text-[#2F6844]">{t.auth.subtitle}</p>
        </div>

        <LoginForm isConfigured={isConfigured} />
      </div>
    </div>
  );
}
