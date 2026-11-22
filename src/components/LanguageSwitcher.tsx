"use client";

import { useRouter } from "next/navigation";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n";
import { useT } from "./I18nProvider";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const router = useRouter();
  const { locale } = useT();

  async function selectLocale(next: Locale) {
    if (next === locale) return;
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    router.refresh();
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-[#E7DDD0] bg-[#FAF7F2] p-1 ${
        compact ? "text-[11px]" : "text-xs"
      }`}
    >
      {!compact && <Globe className="w-3.5 h-3.5 text-[#7B6554] ml-1.5 mr-0.5" />}
      {LOCALE_OPTIONS.map((opt) => {
        const active = opt.code === locale;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => selectLocale(opt.code)}
            title={opt.label}
            className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              active
                ? "bg-[#4A2C18] text-white shadow-xs"
                : "text-[#5C4938] hover:bg-[#E7DDD0]/60"
            }`}
          >
            {opt.code === "lo" ? "ລາວ" : opt.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
