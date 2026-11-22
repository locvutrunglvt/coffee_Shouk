import { cookies } from "next/headers";
import { getDictionary, LOCALE_COOKIE, normalizeLocale, type Locale } from "./index";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export async function getServerI18n() {
  const locale = await getServerLocale();
  return {
    locale,
    t: getDictionary(locale),
  };
}
