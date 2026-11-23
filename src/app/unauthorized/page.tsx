import Link from "next/link";
import { ShieldAlert, Clock } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n/server";
import { SignOutToLoginButton } from "@/components/SignOutToLoginButton";

export default async function UnauthorizedPage() {
  const [ctx, { t }] = await Promise.all([getAuthContext(), getServerI18n()]);
  const isPendingOrLocked = Boolean(ctx.profile && !ctx.profile.is_active);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full card-3d rounded-3xl p-6 text-center space-y-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto icon-3d ${
            isPendingOrLocked
              ? "bg-amber-100 text-amber-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {isPendingOrLocked ? (
            <Clock className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7" />
          )}
        </div>
        <h1 className="text-xl font-extrabold text-[#14532D]">
          {isPendingOrLocked
            ? t.auth.pendingApprovalTitle
            : t.auth.unauthorizedTitle}
        </h1>
        <p className="text-sm font-medium text-[#2F6844]">
          {isPendingOrLocked
            ? t.auth.pendingApprovalDesc
            : t.auth.unauthorizedDesc}
        </p>
        {isPendingOrLocked ? (
          <SignOutToLoginButton label={t.auth.switchAccountBtn} />
        ) : (
          <Link
            href="/"
            className="inline-block px-5 py-3 rounded-2xl btn-3d-green text-sm font-bold"
          >
            {t.auth.backHome}
          </Link>
        )}
      </div>
    </div>
  );
}
