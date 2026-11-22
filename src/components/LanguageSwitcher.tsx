"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n/types";
import { useT } from "./I18nProvider";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const router = useRouter();
  const { locale } = useT();
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  async function selectLocale(next: Locale) {
    if (next === locale) return;
    setPendingLocale(next);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  const effectiveLocale = isPending && pendingLocale ? pendingLocale : locale;

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-[#BCE8C8] bg-[#EAFBF0] p-1 text-xs ${
        isPending ? "opacity-75" : ""
      }`}
    >
      {!compact && <Globe className="w-4 h-4 text-[#15803D] ml-1.5 mr-0.5" />}
      {LOCALE_OPTIONS.map((opt) => {
        const active = opt.code === effectiveLocale;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={isPending}
            onClick={() => selectLocale(opt.code)}
            title={opt.label}
            className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
              active
                ? "bg-gradient-to-b from-[#22C55E] to-[#16A34A] text-white shadow-xs"
                : "text-[#14532D] hover:bg-white/80"
            }`}
          >
            {opt.code === "lo" ? "ລາວ" : opt.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
