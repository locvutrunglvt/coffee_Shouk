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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, ROLE_STYLE, type NavItem } from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

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

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));
  const bottomNavItems = visibleItems.filter((item) => item.mobilePrimary).slice(0, 4);
  const roleStyle = ROLE_STYLE[profile.role];
  const roleLabel = t.roles[profile.role];

  const isActiveRoute = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF7F2] text-[#231810]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-[#E7DDD0] z-30">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[#E7DDD0]">
          <Image
            src="/logo-taoi.jpeg"
            alt={settings.shop_name}
            width={44}
            height={44}
            className="w-11 h-11 rounded-xl object-cover border border-[#E7DDD0]"
          />
          <div className="min-w-0">
            <p className="font-bold text-base text-[#4A2C18] truncate">
              {settings.shop_name}
            </p>
            <p className="text-xs text-[#7B6554]">
              {t.nav.currencyPrefix}: {settings.currency_code} ({settings.currency_symbol})
            </p>
          </div>
        </div>

        <div className="px-3 pt-3 pb-1 flex justify-center">
          <LanguageSwitcher />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {visibleItems.map((item) => {
            const Icon = ICON_MAP[item.iconName];
            const active = isActiveRoute(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#4A2C18] text-white shadow-sm"
                    : "text-[#4A3828] hover:bg-[#F3ECE2]"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.nav[item.key]}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E7DDD0] bg-[#FCF9F4]">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{profile.full_name}</p>
              <span
                className={`inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${roleStyle.badgeClass}`}
              >
                {roleLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#7B2D26] bg-[#FDF2F2] hover:bg-[#FADBD8] transition-colors cursor-pointer disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{signingOut ? t.nav.signingOut : t.nav.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-[#E7DDD0]">
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src="/logo-taoi.jpeg"
            alt={settings.shop_name}
            width={36}
            height={36}
            className="w-9 h-9 rounded-lg object-cover border border-[#E7DDD0] shrink-0"
          />
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#4A2C18] truncate">
              {settings.shop_name}
            </p>
            <p className="text-[11px] text-[#7B6554] truncate">
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
            className="p-2 rounded-lg border border-[#E7DDD0] text-[#4A2C18] hover:bg-[#F3ECE2]"
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
          <div className="relative ml-auto w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E7DDD0]">
              <div>
                <p className="font-bold text-sm text-[#4A2C18]">{profile.full_name}</p>
                <span
                  className={`inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${roleStyle.badgeClass}`}
                >
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#F3ECE2]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-3 pt-3 flex justify-center">
              <LanguageSwitcher />
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleItems.map((item) => {
                const Icon = ICON_MAP[item.iconName];
                const active = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                      active
                        ? "bg-[#4A2C18] text-white"
                        : "text-[#4A3828] hover:bg-[#F3ECE2]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{t.nav[item.key]}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-[#E7DDD0]">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-[#7B2D26] bg-[#FDF2F2]"
              >
                <LogOut className="w-4 h-4" />
                <span>{signingOut ? t.nav.signingOut : t.nav.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:pl-64 pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E7DDD0] flex items-center justify-around px-1 py-1.5">
        {bottomNavItems.map((item) => {
          const Icon = ICON_MAP[item.iconName];
          const active = isActiveRoute(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg min-w-[60px] ${
                active ? "text-[#4A2C18] font-semibold" : "text-[#7B6554]"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-[#C97B36]" : ""}`} />
              <span className="text-[11px] mt-0.5 truncate">
                {t.nav.short[item.key]}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center px-2 py-1 rounded-lg min-w-[60px] text-[#7B6554]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[11px] mt-0.5">{t.nav.more}</span>
        </button>
      </nav>
    </div>
  );
}
