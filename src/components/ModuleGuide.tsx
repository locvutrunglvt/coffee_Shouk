"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import type { Dictionary } from "@/lib/i18n";
import { BookOpenCheck, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

type GuideKey = Exclude<
  keyof Dictionary["guides"],
  "toggleOpen" | "toggleClose" | "tipLabel"
>;

interface ModuleGuideProps {
  guideKey: GuideKey;
  defaultOpen?: boolean;
}

export function ModuleGuide({
  guideKey,
  defaultOpen = false,
}: ModuleGuideProps) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen);
  const guide = t.guides[guideKey];

  return (
    <div className="rounded-2xl border-2 border-[#BCE8C8] bg-gradient-to-r from-[#E9FAEE] via-[#F4FDF7] to-[#E9FAEE] shadow-[0_3px_0_0_#C8EED3] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-[#E1F7E8]/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#22C55E] to-[#15803D] text-white flex items-center justify-center shrink-0 icon-3d">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm sm:text-base text-[#14532D] truncate">
              {guide.title}
            </p>
            <p className="text-xs font-medium text-[#15803D]">
              {open ? t.guides.toggleClose : t.guides.toggleOpen}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-[#BCE8C8] text-xs font-bold text-[#15803D] shrink-0 shadow-xs">
          <span>{open ? t.guides.toggleClose : t.guides.toggleOpen}</span>
          {open ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#CBEFD5] bg-white/75">
          <ol className="space-y-2.5 pt-2">
            {guide.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm sm:text-base text-[#143321]">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#22C55E] to-[#16A34A] text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FEFCE8] border border-[#FDE047] text-xs sm:text-sm text-[#713F12]">
            <Lightbulb className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
            <span>
              <strong>{t.guides.tipLabel}:</strong> {guide.tip}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
