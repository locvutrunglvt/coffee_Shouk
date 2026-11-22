import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getServerI18n } from "@/lib/i18n/server";

export default async function UnauthorizedPage() {
  const { t } = await getServerI18n();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF7F2]">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#E7DDD0] p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-[#4A2C18]">{t.auth.unauthorizedTitle}</h1>
        <p className="text-sm text-[#7B6554]">{t.auth.unauthorizedDesc}</p>
        <Link
          href="/"
          className="inline-block px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-medium"
        >
          {t.auth.backHome}
        </Link>
      </div>
    </div>
  );
}
