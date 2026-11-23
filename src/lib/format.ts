export type CurrencyCode = "LAK" | "VND" | "THB" | "USD";

export const CURRENCIES: Record<
  CurrencyCode,
  { code: CurrencyCode; symbol: string; label: string; locale: string }
> = {
  LAK: { code: "LAK", symbol: "₭", label: "Kip Lào (LAK ₭)", locale: "lo-LA" },
  VND: { code: "VND", symbol: "₫", label: "Việt Nam Đồng (VND ₫)", locale: "vi-VN" },
  THB: { code: "THB", symbol: "฿", label: "Baht Thái (THB ฿)", locale: "th-TH" },
  USD: { code: "USD", symbol: "$", label: "Đô la Mỹ (USD $)", locale: "en-US" },
};

const LAOS_OFFSET_MS = 7 * 60 * 60 * 1000;

export function getLaosNowShifted(): Date {
  return new Date(Date.now() + LAOS_OFFSET_MS);
}

/** Returns "YYYY-MM-DD" in Laos/Vietnam timezone (UTC+7). */
export function getLocalTodayDateStr(): string {
  return getLaosNowShifted().toISOString().slice(0, 10);
}

/** Returns "YYYY-MM" in Laos/Vietnam timezone (UTC+7). */
export function getLocalCurrentMonthStr(): string {
  return getLaosNowShifted().toISOString().slice(0, 7);
}

/** Returns the UTC ISO string representing 00:00:00 today in UTC+7. */
export function getLocalTodayStartIso(): string {
  const todayStr = getLocalTodayDateStr();
  return new Date(`${todayStr}T00:00:00+07:00`).toISOString();
}

/** Returns UTC ISO start (inclusive) and end (exclusive) bounds for "YYYY-MM" in UTC+7. */
export function getLocalMonthBoundsIso(ym: string): {
  startIso: string;
  endIso: string;
} {
  const [y, m] = ym.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const startStr = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const endStr = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`;
  return {
    startIso: new Date(`${startStr}T00:00:00+07:00`).toISOString(),
    endIso: new Date(`${endStr}T00:00:00+07:00`).toISOString(),
  };
}

export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode: string = "LAK"
): string {
  const num = Number(amount ?? 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  const cfg =
    CURRENCIES[
      (currencyCode as CurrencyCode) in CURRENCIES
        ? (currencyCode as CurrencyCode)
        : "LAK"
    ];

  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: currencyCode === "USD" ? 2 : 0,
  }).format(safeNum);

  return `${formatted} ${cfg.symbol}`;
}

export function formatDateTimeVN(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Vientiane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
