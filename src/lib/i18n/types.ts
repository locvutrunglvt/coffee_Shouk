export type Locale = "vi" | "en" | "lo";

export const LOCALE_COOKIE = "taoi_locale";

export const LOCALE_OPTIONS: { code: Locale; label: string; flag: string }[] = [
  { code: "vi", label: "Tiếng Việt", flag: "VN" },
  { code: "en", label: "English", flag: "EN" },
  { code: "lo", label: "ພາສາລາວ", flag: "LA" },
];
