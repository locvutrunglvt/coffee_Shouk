import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getServerI18n } from "@/lib/i18n/server";

export default async function UnauthorizedPage() {
  const { t } = await getServerI18n();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full card-3d rounded-3xl p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto icon-3d">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-extrabold text-[#14532D]">
          {t.auth.unauthorizedTitle}
        </h1>
        <p className="text-sm font-medium text-[#2F6844]">
          {t.auth.unauthorizedDesc}
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-3 rounded-2xl btn-3d-green text-sm font-bold"
        >
          {t.auth.backHome}
        </Link>
      </div>
    </div>
  );
}
