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

export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode: string = "LAK"
): string {
  const num = Number(amount ?? 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  const cfg =
    CURRENCIES[(currencyCode as CurrencyCode) in CURRENCIES ? (currencyCode as CurrencyCode) : "LAK"];

  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: currencyCode === "USD" ? 2 : 0,
  }).format(safeNum);

  return `${formatted} ${cfg.symbol}`;
}

export function formatDateTimeVN(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
