import Image from "next/image";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getServerI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const { isConfigured } = getSupabaseEnv();
  const { t } = await getServerI18n();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF7F2]">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E7DDD0] shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex justify-end">
          <LanguageSwitcher compact />
        </div>

        <div className="flex flex-col items-center text-center space-y-2">
          <Image
            src="/logo-taoi.jpeg"
            alt="Tà Ơi Coffee"
            width={80}
            height={80}
            className="w-20 h-20 rounded-2xl object-cover border border-[#E7DDD0] shadow-sm"
            priority
          />
          <h1 className="text-xl font-bold text-[#4A2C18]">Tà Ơi Coffee</h1>
          <p className="text-xs text-[#7B6554]">{t.auth.subtitle}</p>
        </div>

        <LoginForm isConfigured={isConfigured} />
      </div>
    </div>
  );
}
