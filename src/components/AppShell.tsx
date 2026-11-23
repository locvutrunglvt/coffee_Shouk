"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Coffee,
  Wallet,
  BookOpen,
  PackagePlus,
  ClipboardCheck,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Sprout,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, ROLE_STYLE, type NavItem } from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SessionProvider } from "@/components/SessionContext";

const ICON_MAP: Record<NavItem["iconName"], React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  ShoppingBag,
  Coffee,
  Wallet,
  BookOpen,
  PackagePlus,
  ClipboardCheck,
  Receipt,
  BarChart3,
  Settings,
};

interface AppShellProps {
  profile: UserProfile;
  settings: ShopSettings;
  children: React.ReactNode;
}

export function AppShell({ profile, settings, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwFeedback(null);
    if (newPw.length < 6) {
      setPwFeedback({ type: "err", text: t.auth.passwordTooShort });
      return;
    }
    if (newPw !== confirmPw) {
      setPwFeedback({ type: "err", text: t.auth.passwordMismatch });
      return;
    }
    setPwSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        setPwFeedback({ type: "err", text: error.message });
      } else {
        setPwFeedback({ type: "ok", text: t.auth.passwordChanged });
        setNewPw("");
        setConfirmPw("");
      }
    } catch {
      setPwFeedback({ type: "err", text: t.auth.errNetwork });
    } finally {
      setPwSaving(false);
    }
  }

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));
  const bottomNavItems = visibleItems.filter((item) => item.mobilePrimary).slice(0, 4);
  const roleStyle = ROLE_STYLE[profile.role];
  const roleLabel = t.roles[profile.role];

  const isNavigating = pendingHref !== null && pendingHref !== pathname;

  const isActiveRoute = (href: string) => {
    const current = isNavigating ? pendingHref : pathname;
    return href === "/" ? current === "/" : current.startsWith(href);
  };

  function handleNavClick(href: string) {
    if (href !== pathname) {
      setPendingHref(href);
    }
    setMobileMenuOpen(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <SessionProvider profile={profile} settings={settings}>
      <div className="min-h-screen flex flex-col md:flex-row text-[#143321]">
      {/* Instant top navigation bar */}
      {isNavigating && (
        <div className="fixed top-0 inset-x-0 h-1 bg-gradient-to-r from-[#22C55E] via-[#84CC16] to-[#16A34A] animate-pulse z-50" />
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 bg-white border-r-2 border-[#CDE9D5] shadow-[4px_0_24px_-8px_rgba(22,163,74,0.14)] z-30">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[#DDF3E4] bg-gradient-to-r from-[#EAFBF0] to-white">
          <Image
            src="/logo-taoi.jpeg"
            alt={settings.shop_name}
            width={48}
            height={48}
            className="w-12 h-12 rounded-2xl object-cover border-2 border-[#86EFAC] shadow-sm"
          />
          <div className="min-w-0">
            <p className="font-extrabold text-lg text-[#14532D] truncate flex items-center gap-1.5">
              <span>{settings.shop_name}</span>
              <Sprout className="w-4 h-4 text-[#16A34A] shrink-0" />
            </p>
            <p className="text-xs font-semibold text-[#15803D]">
              {t.nav.currencyPrefix}: {settings.currency_code} ({settings.currency_symbol})
            </p>
          </div>
        </div>

        <div className="px-3 pt-3 pb-1 flex justify-center">
          <LanguageSwitcher />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {visibleItems.map((item) => {
            const Icon = ICON_MAP[item.iconName];
            const active = isActiveRoute(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] font-bold transition-all ${
                  active
                    ? "bg-gradient-to-r from-[#16A34A] to-[#22C55E] text-white shadow-[0_4px_0_0_#15803D,0_8px_16px_-4px_rgba(22,163,74,0.35)]"
                    : "text-[#143321] hover:bg-[#EAFBF0] hover:translate-x-0.5"
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.iconGradient} text-white flex items-center justify-center shrink-0 icon-3d`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="truncate">{t.nav[item.key]}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-[#DDF3E4] bg-gradient-to-t from-[#EAFBF0] to-white">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#14532D] truncate">
                {profile.full_name}
              </p>
              <span
                className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${roleStyle.badgeClass}`}
              >
                {roleLabel}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPwFeedback(null);
                setNewPw("");
                setConfirmPw("");
                setPwModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-[#14532D] bg-white hover:bg-[#EAFBF0] border border-[#CDE9D5] transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.auth.changePasswordBtn}</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {signingOut ? t.nav.signingOut : t.nav.signOut}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b-2 border-[#CDE9D5] shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <Image
            src="/logo-taoi.jpeg"
            alt={settings.shop_name}
            width={40}
            height={40}
            className="w-10 h-10 rounded-xl object-cover border-2 border-[#86EFAC] shrink-0"
          />
          <div className="min-w-0">
            <p className="font-extrabold text-base text-[#14532D] truncate">
              {settings.shop_name}
            </p>
            <p className="text-xs font-semibold text-[#15803D] truncate">
              {profile.full_name} • {roleLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageSwitcher compact />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t.nav.openMenu}
            className="p-2 rounded-xl border-2 border-[#BCE8C8] bg-[#EAFBF0] text-[#14532D]"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Full Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative ml-auto w-80 max-w-[88vw] bg-white h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#DDF3E4] bg-[#EAFBF0]">
              <div>
                <p className="font-extrabold text-base text-[#14532D]">
                  {profile.full_name}
                </p>
                <span
                  className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${roleStyle.badgeClass}`}
                >
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-xl bg-white border border-[#CDE9D5]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-3 pt-3 flex justify-center">
              <LanguageSwitcher />
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-2">
              {visibleItems.map((item) => {
                const Icon = ICON_MAP[item.iconName];
                const active = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => handleNavClick(item.href)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-base font-bold ${
                      active
                        ? "bg-gradient-to-r from-[#16A34A] to-[#22C55E] text-white shadow-md"
                        : "text-[#143321] hover:bg-[#EAFBF0]"
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.iconGradient} text-white flex items-center justify-center shrink-0 icon-3d`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span>{t.nav[item.key]}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-[#DDF3E4] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setPwFeedback(null);
                  setNewPw("");
                  setConfirmPw("");
                  setPwModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-[#14532D] bg-[#EAFBF0] border border-[#CDE9D5]"
              >
                <KeyRound className="w-4 h-4" />
                <span>{t.auth.changePasswordBtn}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200"
              >
                <LogOut className="w-4 h-4" />
                <span>{signingOut ? t.nav.signingOut : t.nav.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:pl-72 pb-24 md:pb-10">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t-2 border-[#CDE9D5] flex items-center justify-around px-1 py-1.5 shadow-[0_-4px_16px_rgba(22,163,74,0.1)]">
        {bottomNavItems.map((item) => {
          const Icon = ICON_MAP[item.iconName];
          const active = isActiveRoute(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => handleNavClick(item.href)}
              className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl min-w-[62px] ${
                active ? "text-[#15803D] font-extrabold" : "text-[#3B6B4C] font-semibold"
              }`}
            >
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform ${
                  active
                    ? `bg-gradient-to-br ${item.iconGradient} text-white icon-3d -translate-y-0.5`
                    : "bg-[#EAFBF0] text-[#15803D]"
                }`}
              >
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-[11px] mt-0.5 truncate">
                {t.nav.short[item.key]}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center px-2 py-1 rounded-xl min-w-[62px] text-[#3B6B4C] font-semibold"
        >
          <span className="w-8 h-8 rounded-xl bg-[#EAFBF0] text-[#15803D] flex items-center justify-center">
            <Menu className="w-4 h-4" />
          </span>
          <span className="text-[11px] mt-0.5">{t.nav.more}</span>
        </button>
      </nav>

      {/* Change Password Modal */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleChangePassword}
            className="card-3d rounded-3xl w-full max-w-sm p-5 space-y-4 bg-white"
          >
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <div className="flex items-center gap-2 font-extrabold text-[#14532D]">
                <KeyRound className="w-4 h-4 text-[#16A34A]" />
                <h3>{t.auth.changePasswordTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwFeedback && (
              <div
                className={`flex items-start gap-2 p-2.5 rounded-xl text-xs border ${
                  pwFeedback.type === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {pwFeedback.type === "ok" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{pwFeedback.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#14532D] mb-1">
                {t.auth.newPassword}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#14532D] mb-1">
                {t.auth.confirmPassword}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#CDE9D5] text-sm font-semibold cursor-pointer"
              >
                {t.common.close}
              </button>
              <button
                type="submit"
                disabled={pwSaving}
                className="px-4 py-2 rounded-xl btn-3d-green text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                {pwSaving ? t.common.saving : t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </SessionProvider>
  );
}
