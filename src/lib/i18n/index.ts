import { vi, type Dictionary } from "./vi";
import { en } from "./en";
import { lo } from "./lo";
import { LOCALE_COOKIE, LOCALE_OPTIONS, type Locale } from "./types";

export { LOCALE_COOKIE, LOCALE_OPTIONS, type Locale, type Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = {
  vi,
  en,
  lo,
};

export function normalizeLocale(value?: string | null): Locale {
  if (value === "en" || value === "lo" || value === "vi") {
    return value;
  }
  return "lo";
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? lo;
}
