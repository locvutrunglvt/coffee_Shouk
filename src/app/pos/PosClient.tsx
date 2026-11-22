"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeVN, formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import {
  deductStockAndSyncShift,
  type CartItemInput,
  type CartTopping,
} from "@/lib/posActions";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import type { OrderStatus, OrderType, PaymentMethod } from "@/lib/types";
import type {
  CategoryRow,
  ProductRow,
  TableRow,
  ToppingRow,
  VariantRow,
} from "@/app/menu/MenuClient";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coffee,
  CreditCard,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

interface RecentOrderRow {
  id: string;
  order_number: number;
  order_type: OrderType;
  status: OrderStatus;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: "paid" | "unpaid";
  created_at: string;
  table_id: string | null;
  dining_tables: { name: string } | null;
  order_items: {
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    variant_name: string;
    quantity: number;
    unit_price: number;
    toppings_json: CartTopping[];
    line_total: number;
    note: string;
  }[];
}

interface PosClientProps {
  profile: UserProfile;
  settings: ShopSettings;
  categories: CategoryRow[];
  products: ProductRow[];
  variants: VariantRow[];
  toppings: ToppingRow[];
  tables: TableRow[];
  openShiftId: string | null;
  initialRecentOrders: RecentOrderRow[];
}

export function PosClient({
  profile,
  settings,
  categories,
  products,
  variants,
  toppings,
  tables,
  openShiftId,
  initialRecentOrders,
}: PosClientProps) {
  const { t } = useT();
  const canCollectCash = profile.role !== "staff";
  const canCancel = profile.role === "admin" || profile.role === "manager";

  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableId, setTableId] = useState<string>(tables[0]?.id ?? "");

  const [cart, setCart] = useState<CartItemInput[]>([]);
  const [discount, setDiscount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] =
    useState<RecentOrderRow[]>(initialRecentOrders);

  // Customize product modal
  const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null);
  const [pickedToppings, setPickedToppings] = useState<CartTopping[]>([]);
  const [pickedQty, setPickedQty] = useState(1);
  const [pickedNote, setPickedNote] = useState("");

  function openCustomize(p: ProductRow) {
    if (!p.is_available) return;
    const pVars = variants.filter((v) => v.product_id === p.id && v.is_active);
    setActiveProduct(p);
    setPickedVariantId(pVars[0]?.id ?? null);
    setPickedToppings([]);
    setPickedQty(1);
    setPickedNote("");
  }

  function addCustomizedToCart() {
    if (!activeProduct) return;
    const pVars = variants.filter(
      (v) => v.product_id === activeProduct.id && v.is_active
    );
    const chosenVar = pVars.find((v) => v.id === pickedVariantId);
    const unitPrice = chosenVar
      ? Number(chosenVar.price)
      : Number(activeProduct.base_price);

    setCart((prev) => [
      ...prev,
      {
        productId: activeProduct.id,
        variantId: chosenVar?.id ?? null,
        productName: activeProduct.name,
        variantName: chosenVar?.name ?? "",
        quantity: pickedQty,
        unitPrice,
        toppings: pickedToppings,
        note: pickedNote.trim(),
      },
    ]);
    setActiveProduct(null);
  }

  function updateCartQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const subtotal = cart.reduce((sum, item) => {
    const topSum = item.toppings.reduce((s, tp) => s + tp.price, 0);
    return sum + (item.unitPrice + topSum) * item.quantity;
  }, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const totalDue = Math.max(0, subtotal - discountNum);
  const cashReceivedNum = Number(cashReceived) || 0;
  const cashChange = Math.max(0, cashReceivedNum - totalDue);

  async function refreshRecentOrders() {
    const supabase = createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select(
        "id, order_number, order_type, status, total_amount, payment_method, payment_status, created_at, table_id, dining_tables(name), order_items(product_id, variant_id, product_name, variant_name, quantity, unit_price, toppings_json, line_total, note)"
      )
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(15);
    if (data) setRecentOrders(data as unknown as RecentOrderRow[]);
  }

  async function submitOrder(markAsPaid: boolean) {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const supabase = createClient();
      const { data: createdOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          shift_id: openShiftId,
          table_id: orderType === "dine_in" && tableId ? tableId : null,
          order_type: orderType,
          status: "pending",
          subtotal,
          discount_amount: discountNum,
          discount_reason: discountReason.trim(),
          total_amount: totalDue,
          payment_method: paymentMethod,
          payment_status: markAsPaid ? "paid" : "unpaid",
          cash_received: markAsPaid && paymentMethod === "cash" ? cashReceivedNum || totalDue : 0,
          cash_change: markAsPaid && paymentMethod === "cash" ? cashChange : 0,
          note: orderNote.trim(),
          created_by: profile.id,
        })
        .select("id, order_number")
        .single();

      if (orderErr || !createdOrder) throw orderErr;

      const itemsPayload = cart.map((item) => {
        const toppingsTotal = item.toppings.reduce((s, tp) => s + tp.price, 0);
        return {
          order_id: createdOrder.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          variant_name: item.variantName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          toppings_json: item.toppings,
          toppings_total: toppingsTotal,
          line_total: (item.unitPrice + toppingsTotal) * item.quantity,
          note: item.note,
          status: "pending",
        };
      });

      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      if (markAsPaid) {
        await deductStockAndSyncShift(supabase, {
          orderId: createdOrder.id,
          orderNumber: createdOrder.order_number,
          items: cart,
          paymentMethod,
          totalAmount: totalDue,
          shiftId: openShiftId,
          userId: profile.id,
        });
      }

      setCart([]);
      setDiscount("0");
      setDiscountReason("");
      setOrderNote("");
      setCashReceived("");
      setToast(`${t.pos.orderCreatedMsg} (#${createdOrder.order_number})`);
      await refreshRecentOrders();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCollectUnpaid(order: RecentOrderRow) {
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_method: paymentMethod,
        shift_id: openShiftId,
      })
      .eq("id", order.id);

    if (!error) {
      const mappedItems: CartItemInput[] = (order.order_items ?? [])
        .filter((i) => i.product_id)
        .map((i) => ({
          productId: i.product_id!,
          variantId: i.variant_id,
          productName: i.product_name,
          variantName: i.variant_name,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price),
          toppings: Array.isArray(i.toppings_json) ? i.toppings_json : [],
          note: i.note,
        }));

      await deductStockAndSyncShift(supabase, {
        orderId: order.id,
        orderNumber: order.order_number,
        items: mappedItems,
        paymentMethod,
        totalAmount: Number(order.total_amount),
        shiftId: openShiftId,
        userId: profile.id,
      });

      await refreshRecentOrders();
    }
  }

  async function handleCancelOrder(order: RecentOrderRow) {
    if (!canCancel) return;
    const reason = window.prompt(t.pos.cancelReasonPrompt);
    if (reason === null) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_by: profile.id,
        cancel_reason: reason.trim(),
      })
      .eq("id", order.id);

    if (!error) {
      await supabase.from("audit_logs").insert({
        actor_id: profile.id,
        action: "cancel_order",
        entity_type: "orders",
        entity_id: order.id,
        details: { order_number: order.order_number, reason: reason.trim() },
      });
      await refreshRecentOrders();
    }
  }

  function handlePrintOrder(order: RecentOrderRow) {
    const win = window.open("", "_blank", "width=360,height=600");
    if (!win) return;
    const rowsHtml = order.order_items
      .map(
        (i) =>
          `<tr>
            <td>${i.quantity}x ${i.product_name}${i.variant_name ? ` (${i.variant_name})` : ""}</td>
            <td style="text-align:right">${formatMoney(i.line_total, settings.currency_code)}</td>
          </tr>`
      )
      .join("");

    win.document.write(`
      <html><head><title>#${order.order_number}</title>
      <style>body{font-family:monospace;padding:12px;font-size:12px}h2,p{margin:2px 0;text-align:center}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:4px 0;border-bottom:1px dashed #ccc}</style>
      </head><body>
      <h2>${settings.shop_name}</h2>
      <p>${settings.address || ""}</p>
      <p>${settings.phone || ""}</p>
      <hr/>
      <p><strong>#${order.order_number}</strong> • ${formatDateTimeVN(order.created_at)}</p>
      <table>${rowsHtml}</table>
      <p style="text-align:right;font-size:14px;margin-top:8px"><strong>${t.common.total}: ${formatMoney(order.total_amount, settings.currency_code)}</strong></p>
      <script>window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCat === "all" || p.category_id === selectedCat;
    const matchSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchCat && matchSearch;
  });

  const activeProdVars = activeProduct
    ? variants.filter((v) => v.product_id === activeProduct.id && v.is_active)
    : [];

  return (
    <div className="space-y-6">
      {!openShiftId && canCollectCash && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t.pos.noOpenShiftWarn}</span>
          </div>
          <Link
            href="/shifts"
            className="px-3 py-1.5 rounded-lg bg-[#4A2C18] text-white font-semibold"
          >
            {t.pos.goOpenShift}
          </Link>
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT: MENU GRID */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-3 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8C7563] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.pos.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[#E7DDD0] bg-[#FAF7F2]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCat("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                  selectedCat === "all"
                    ? "bg-[#4A2C18] text-white border-[#4A2C18]"
                    : "bg-[#FAF7F2] text-[#5C4938] border-[#E7DDD0]"
                }`}
              >
                {t.common.all}
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCat(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                    selectedCat === c.id
                      ? "bg-[#4A2C18] text-white border-[#4A2C18]"
                      : "bg-[#FAF7F2] text-[#5C4938] border-[#E7DDD0]"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.is_available}
                onClick={() => openCustomize(p)}
                className={`text-left bg-white rounded-2xl border overflow-hidden flex flex-col transition-all ${
                  p.is_available
                    ? "border-[#E7DDD0] hover:border-[#C97B36] hover:shadow-sm cursor-pointer active:scale-[0.99]"
                    : "border-red-200 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="relative h-28 w-full bg-[#F3ECE2] flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Coffee className="w-8 h-8 text-[#8C7563]/60" />
                  )}
                  {!p.is_available && (
                    <span className="absolute inset-0 bg-black/50 text-white text-xs font-bold flex items-center justify-center">
                      {t.pos.outOfStock}
                    </span>
                  )}
                </div>
                <div className="p-2.5 flex-1 flex flex-col justify-between">
                  <p className="font-semibold text-xs sm:text-sm text-[#4A2C18] line-clamp-2">
                    {p.name}
                  </p>
                  <p className="text-xs font-bold text-[#C97B36] mt-1">
                    {formatMoney(p.base_price, settings.currency_code)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: CART & CHECKOUT */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-[#F3ECE2] pb-3">
              <div className="flex items-center gap-2 font-bold text-[#4A2C18]">
                <ShoppingCart className="w-4 h-4 text-[#C97B36]" />
                <span>
                  {t.pos.cartTitle} ({cart.reduce((s, i) => s + i.quantity, 0)})
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-red-600 hover:underline cursor-pointer"
                >
                  {t.common.delete}
                </button>
              )}
            </div>

            {/* Order Type + Table */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#FAF7F2] p-1 rounded-xl text-xs font-semibold">
              {(
                [
                  ["dine_in", t.pos.dineIn],
                  ["take_away", t.pos.takeAway],
                  ["delivery", t.pos.delivery],
                ] as const
              ).map(([typeKey, label]) => (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setOrderType(typeKey)}
                  className={`py-1.5 rounded-lg cursor-pointer ${
                    orderType === typeKey
                      ? "bg-[#4A2C18] text-white"
                      : "text-[#5C4938]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {orderType === "dine_in" && (
              <select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0] bg-white"
              >
                <option value="">{t.pos.selectTable}</option>
                {tables.map((tb) => (
                  <option key={tb.id} value={tb.id}>
                    {tb.name} ({tb.zone})
                  </option>
                ))}
              </select>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <p className="text-xs text-center text-[#7B6554] py-6">
                {t.pos.emptyCart}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {cart.map((item, idx) => {
                  const topSum = item.toppings.reduce((s, tp) => s + tp.price, 0);
                  const lineTotal = (item.unitPrice + topSum) * item.quantity;
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E7DDD0] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#4A2C18]">
                            {item.productName}
                            {item.variantName ? ` (${item.variantName})` : ""}
                          </p>
                          {item.toppings.length > 0 && (
                            <p className="text-[11px] text-[#7B6554]">
                              + {item.toppings.map((tp) => tp.name).join(", ")}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] text-amber-800 italic">
                              {item.note}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-red-500 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 bg-white border border-[#E7DDD0] rounded-lg px-1.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartQty(idx, -1)}
                            className="p-0.5 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(idx, 1)}
                            className="p-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-xs font-bold text-[#4A2C18]">
                          {formatMoney(lineTotal, settings.currency_code)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totals & Payment */}
            <div className="border-t border-[#F3ECE2] pt-3 space-y-2.5 text-xs">
              <input
                type="text"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder={t.pos.orderNotePlaceholder}
                className="w-full px-3 py-1.5 rounded-xl border border-[#E7DDD0]"
              />

              {canCollectCash && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#7B6554] mb-0.5">
                      {t.pos.discount}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E7DDD0]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#7B6554] mb-0.5">
                      {t.common.note}
                    </label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder={t.pos.discountReasonPlaceholder}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E7DDD0]"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between text-[#7B6554]">
                <span>{t.pos.subtotal}</span>
                <span>{formatMoney(subtotal, settings.currency_code)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#4A2C18]">
                <span>{t.pos.totalDue}</span>
                <span>{formatMoney(totalDue, settings.currency_code)}</span>
              </div>

              {canCollectCash && (
                <>
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {(
                      [
                        ["cash", t.pos.cash, Banknote],
                        ["qr_transfer", t.pos.qrTransfer, QrCode],
                        ["card", t.pos.card, CreditCard],
                      ] as const
                    ).map(([m, label, Icon]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`flex flex-col items-center py-2 px-1 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                          paymentMethod === m
                            ? "bg-[#4A2C18] text-white border-[#4A2C18]"
                            : "bg-white text-[#5C4938] border-[#E7DDD0]"
                        }`}
                      >
                        <Icon className="w-4 h-4 mb-0.5" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>

                  {paymentMethod === "cash" && (
                    <div className="bg-[#FAF7F2] p-2.5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#7B6554]">
                          {t.pos.cashReceived}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCashReceived(String(totalDue))}
                          className="text-[11px] font-semibold text-[#C97B36] hover:underline cursor-pointer"
                        >
                          {t.pos.exactCash}
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder={String(totalDue)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#E7DDD0] bg-white text-sm font-semibold"
                      />
                      <div className="flex justify-between text-xs font-semibold text-emerald-700">
                        <span>{t.pos.cashChange}</span>
                        <span>{formatMoney(cashChange, settings.currency_code)}</span>
                      </div>
                    </div>
                  )}

                  {paymentMethod === "qr_transfer" && (
                    <div className="bg-[#FAF7F2] p-3 rounded-xl text-center space-y-1.5 border border-[#E7DDD0]">
                      <p className="text-[11px] text-[#7B6554]">
                        {t.pos.qrScanHint}
                      </p>
                      {settings.qr_image_url ? (
                        <Image
                          src={settings.qr_image_url}
                          alt="Payment QR"
                          width={140}
                          height={140}
                          className="w-36 h-36 mx-auto object-contain rounded-xl bg-white p-1 border border-[#E7DDD0]"
                        />
                      ) : (
                        <p className="text-[11px] text-amber-800">
                          {t.pos.noQrConfigured}
                        </p>
                      )}
                      {settings.bank_info && (
                        <p className="text-xs font-semibold text-[#4A2C18]">
                          {settings.bank_info}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2 pt-1">
                {canCollectCash && (
                  <button
                    type="button"
                    disabled={cart.length === 0 || submitting}
                    onClick={() => submitOrder(true)}
                    className="w-full py-3 rounded-xl bg-[#4A2C18] hover:bg-[#3A2212] text-white font-bold text-sm cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? t.common.saving : t.pos.checkoutBtn}
                  </button>
                )}
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={() => submitOrder(false)}
                  className="w-full py-2.5 rounded-xl border border-[#4A2C18] text-[#4A2C18] hover:bg-[#F3ECE2] font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  {t.pos.sendOnlyBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RECENT ORDERS TODAY */}
      <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-3">
        <h2 className="font-bold text-sm text-[#4A2C18]">{t.pos.recentOrders}</h2>
        {recentOrders.length === 0 ? (
          <p className="text-xs text-[#7B6554]">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E7DDD0] text-[#7B6554]">
                  <th className="py-2 pr-3">{t.pos.orderNo}</th>
                  <th className="py-2 pr-3">{t.pos.selectTable}</th>
                  <th className="py-2 pr-3">{t.common.total}</th>
                  <th className="py-2 pr-3">{t.common.status}</th>
                  <th className="py-2 pr-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3ECE2]">
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-3 font-bold text-[#4A2C18]">
                      #{o.order_number}
                    </td>
                    <td className="py-2.5 pr-3">
                      {o.order_type === "dine_in"
                        ? o.dining_tables?.name ?? t.pos.dineIn
                        : o.order_type === "take_away"
                        ? t.pos.takeAway
                        : t.pos.delivery}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold">
                      {formatMoney(o.total_amount, settings.currency_code)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          o.status === "cancelled"
                            ? "bg-red-100 text-red-700"
                            : o.payment_status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {o.status === "cancelled"
                          ? t.common.cancel
                          : o.payment_status === "paid"
                          ? t.pos.paid
                          : t.pos.unpaid}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 flex items-center gap-2">
                      {canCollectCash &&
                        o.payment_status === "unpaid" &&
                        o.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => handleCollectUnpaid(o)}
                            className="px-2.5 py-1 rounded-lg bg-[#4A2C18] text-white font-semibold cursor-pointer"
                          >
                            {t.pos.collectPayment}
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => handlePrintOrder(o)}
                        className="p-1.5 rounded-lg border border-[#E7DDD0] hover:bg-[#FAF7F2] cursor-pointer"
                        title={t.common.print}
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {canCancel && o.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(o)}
                          className="px-2 py-1 rounded-lg bg-red-50 text-red-700 font-medium cursor-pointer"
                        >
                          {t.pos.cancelOrder}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CUSTOMIZE DRINK MODAL */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F3ECE2] pb-3">
              <div className="flex items-center gap-3">
                {activeProduct.image_url && (
                  <Image
                    src={activeProduct.image_url}
                    alt={activeProduct.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-xl object-cover border border-[#E7DDD0]"
                  />
                )}
                <div>
                  <h3 className="font-bold text-base text-[#4A2C18]">
                    {activeProduct.name}
                  </h3>
                  <p className="text-xs text-[#C97B36] font-semibold">
                    {formatMoney(activeProduct.base_price, settings.currency_code)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="p-1.5 rounded-lg hover:bg-[#F3ECE2] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeProdVars.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#4A3828]">
                  {t.pos.sizeLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeProdVars.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPickedVariantId(v.id)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        pickedVariantId === v.id
                          ? "bg-[#4A2C18] text-white border-[#4A2C18]"
                          : "bg-white text-[#4A2C18] border-[#E7DDD0]"
                      }`}
                    >
                      {v.name} — {formatMoney(v.price, settings.currency_code)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toppings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#4A3828]">
                  {t.pos.toppingsLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {toppings
                    .filter((tp) => tp.is_available)
                    .map((tp) => {
                      const checked = pickedToppings.some((x) => x.id === tp.id);
                      return (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => {
                            if (checked) {
                              setPickedToppings((prev) =>
                                prev.filter((x) => x.id !== tp.id)
                              );
                            } else {
                              setPickedToppings((prev) => [
                                ...prev,
                                { id: tp.id, name: tp.name, price: Number(tp.price) },
                              ]);
                            }
                          }}
                          className={`p-2 rounded-xl border text-left text-xs cursor-pointer ${
                            checked
                              ? "bg-[#F3ECE2] border-[#C97B36] font-semibold text-[#4A2C18]"
                              : "bg-white border-[#E7DDD0] text-[#5C4938]"
                          }`}
                        >
                          <p>{tp.name}</p>
                          <p className="text-[11px] text-[#C97B36]">
                            +{formatMoney(tp.price, settings.currency_code)}
                          </p>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <input
              type="text"
              value={pickedNote}
              onChange={(e) => setPickedNote(e.target.value)}
              placeholder={t.pos.itemNotePlaceholder}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E7DDD0]"
            />

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="inline-flex items-center gap-3 border border-[#E7DDD0] rounded-xl px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setPickedQty((q) => Math.max(1, q - 1))}
                  className="cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-bold text-sm w-5 text-center">
                  {pickedQty}
                </span>
                <button
                  type="button"
                  onClick={() => setPickedQty((q) => q + 1)}
                  className="cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={addCustomizedToCart}
                className="flex-1 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-bold cursor-pointer"
              >
                {t.pos.addToCartBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
