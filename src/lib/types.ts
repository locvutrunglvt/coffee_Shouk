export type PaymentMethod = "cash" | "qr_transfer" | "card" | "other";
export type OrderType = "dine_in" | "take_away" | "delivery";
export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";
export type ExpenseGroup =
  | "rent"
  | "electricity"
  | "water"
  | "internet"
  | "payroll"
  | "maintenance"
  | "marketing"
  | "shift_petty_cash"
  | "other";
