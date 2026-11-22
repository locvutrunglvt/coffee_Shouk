"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeVN, formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import { localizeName, translateText } from "@/lib/i18n/catalogTranslator";
import { PaymentQrCard } from "@/components/PaymentQrCard";
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
  const { t, locale } = useT();
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
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({});
  const [pickedToppings, setPickedToppings] = useState<CartTopping[]>([]);
  const [pickedQty, setPickedQty] = useState(1);
  const [pickedNote, setPickedNote] = useState("");

  // Collect unpaid order modal
  const [collectingOrder, setCollectingOrder] = useState<RecentOrderRow | null>(
    null
  );
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("qr_transfer");
  const [collectingBusy, setCollectingBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("pos-recent-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          refreshRecentOrders();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function openCustomize(p: ProductRow) {
    if (!p.is_available) return;
    const pVars = variants.filter((v) => v.product_id === p.id && v.is_active);
    setActiveProduct(p);
    setVariantQtys(pVars[0] ? { [pVars[0].id]: 1 } : {});
    setPickedToppings([]);
    setPickedQty(1);
    setPickedNote("");
  }

  function addCustomizedToCart() {
    if (!activeProduct) return;
    const pVars = variants.filter(
      (v) => v.product_id === activeProduct.id && v.is_active
    );

    if (pVars.length > 0) {
      const toAdd: CartItemInput[] = [];
      for (const v of pVars) {
        const qty = variantQtys[v.id] ?? 0;
        if (qty > 0) {
          toAdd.push({
            productId: activeProduct.id,
            variantId: v.id,
            productName: activeProduct.name,
            variantName: v.name,
            quantity: qty,
            unitPrice: Number(v.price),
            toppings: pickedToppings,
            note: pickedNote.trim(),
          });
        }
      }
      if (toAdd.length === 0) return;
      setCart((prev) => [...prev, ...toAdd]);
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: activeProduct.id,
          variantId: null,
          productName: activeProduct.name,
          variantName: "",
          quantity: pickedQty,
          unitPrice: Number(activeProduct.base_price),
          toppings: pickedToppings,
          note: pickedNote.trim(),
        },
      ]);
    }
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

  async function handleConfirmCollect() {
    if (!collectingOrder || collectingBusy) return;
    setCollectingBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: collectMethod,
          shift_id: openShiftId,
        })
        .eq("id", collectingOrder.id);

      if (!error) {
        const mappedItems: CartItemInput[] = (collectingOrder.order_items ?? [])
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
          orderId: collectingOrder.id,
          orderNumber: collectingOrder.order_number,
          items: mappedItems,
          paymentMethod: collectMethod,
          totalAmount: Number(collectingOrder.total_amount),
          shiftId: openShiftId,
          userId: profile.id,
        });

        setCollectingOrder(null);
        await refreshRecentOrders();
      }
    } finally {
      setCollectingBusy(false);
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
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      localizeName(p, locale).toLowerCase().includes(q);
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
            className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white font-semibold"
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
          <div className="card-3d rounded-2xl p-3 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#16A34A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.pos.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-[#F2FBF4]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCat("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                  selectedCat === "all"
                    ? "bg-[#16A34A] text-white border-[#16A34A]"
                    : "bg-[#F2FBF4] text-[#1E4D31] border-[#CDE9D5]"
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
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-[#F2FBF4] text-[#1E4D31] border-[#CDE9D5]"
                  }`}
                >
                  {localizeName(c, locale)}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile ergonomic list rows (inspired by mobile video) */}
          <div className="sm:hidden space-y-2">
            {filteredProducts.map((p) => (
              <div
                key={`mob-${p.id}`}
                className={`card-3d rounded-2xl p-2.5 flex items-center justify-between gap-2.5 ${
                  !p.is_available ? "opacity-55" : ""
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-14 h-14 rounded-xl bg-[#EAFBF0] overflow-hidden shrink-0 border border-[#CDE9D5] flex items-center justify-center">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <Coffee className="w-6 h-6 text-[#16A34A]/60" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#14532D] truncate">
                      {localizeName(p, locale)}
                    </p>
                    <p className="text-xs font-extrabold text-[#15803D] mt-0.5">
                      {formatMoney(p.base_price, settings.currency_code)}
                    </p>
                  </div>
                </div>
                {p.is_available ? (
                  <button
                    type="button"
                    onClick={() => openCustomize(p)}
                    className="px-3 py-2 rounded-xl btn-3d-green text-xs font-extrabold shrink-0 cursor-pointer"
                  >
                    {t.orderPublic.pickBtn}
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-xl bg-red-100 text-red-700 text-xs font-bold shrink-0">
                    {t.pos.outOfStock}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Desktop / Tablet POS 5-col grid */}
          <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.is_available}
                onClick={() => openCustomize(p)}
                className={`text-left card-3d rounded-2xl overflow-hidden flex flex-col transition-all ${
                  p.is_available
                    ? "hover:border-[#22C55E] hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]"
                    : "border-red-200 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="relative h-32 w-full bg-[#EAFBF0] flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Coffee className="w-9 h-9 text-[#16A34A]/60" />
                  )}
                  <span className="absolute top-0 right-0 px-2 py-0.5 rounded-bl-xl bg-gradient-to-b from-[#22C55E] to-[#16A34A] text-white text-xs font-extrabold shadow-sm">
                    {formatMoney(p.base_price, settings.currency_code)}
                  </span>
                  {!p.is_available && (
                    <span className="absolute inset-0 bg-black/50 text-white text-xs font-bold flex items-center justify-center">
                      {t.pos.outOfStock}
                    </span>
                  )}
                </div>
                <div className="p-2.5 flex-1 flex items-center justify-center text-center">
                  <p className="font-bold text-xs sm:text-sm text-[#14532D] line-clamp-2">
                    {localizeName(p, locale)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: CART & CHECKOUT */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="card-3d rounded-2xl p-4 space-y-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <div className="flex items-center gap-2 font-bold text-[#14532D]">
                <ShoppingCart className="w-4 h-4 text-[#15803D]" />
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
            <div className="grid grid-cols-3 gap-1.5 bg-[#F2FBF4] p-1 rounded-xl text-xs font-semibold">
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
                      ? "bg-[#16A34A] text-white"
                      : "text-[#1E4D31]"
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
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
              >
                <option value="">{t.pos.selectTable}</option>
                {tables.map((tb) => (
                  <option key={tb.id} value={tb.id}>
                    {localizeName(tb, locale)} ({translateText(tb.zone, locale)})
                  </option>
                ))}
              </select>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <p className="text-xs text-center text-[#2F6844] py-6">
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
                      className="p-2.5 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#14532D]">
                            {translateText(item.productName, locale)}
                            {item.variantName ? ` (${item.variantName})` : ""}
                          </p>
                          {item.toppings.length > 0 && (
                            <p className="text-[11px] text-[#2F6844]">
                              +{" "}
                              {item.toppings
                                .map((tp) => translateText(tp.name, locale))
                                .join(", ")}
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
                        <div className="inline-flex items-center gap-2 bg-white border border-[#CDE9D5] rounded-lg px-1.5 py-0.5">
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
                        <span className="text-xs font-bold text-[#14532D]">
                          {formatMoney(lineTotal, settings.currency_code)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totals & Payment */}
            <div className="border-t border-[#DDF3E4] pt-3 space-y-2.5 text-xs">
              <input
                type="text"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder={t.pos.orderNotePlaceholder}
                className="w-full px-3 py-1.5 rounded-xl border border-[#CDE9D5]"
              />

              {canCollectCash && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#2F6844] mb-0.5">
                      {t.pos.discount}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#CDE9D5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#2F6844] mb-0.5">
                      {t.common.note}
                    </label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder={t.pos.discountReasonPlaceholder}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#CDE9D5]"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between text-[#2F6844]">
                <span>{t.pos.subtotal}</span>
                <span>{formatMoney(subtotal, settings.currency_code)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#14532D]">
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
                            ? "bg-[#16A34A] text-white border-[#16A34A]"
                            : "bg-white text-[#1E4D31] border-[#CDE9D5]"
                        }`}
                      >
                        <Icon className="w-4 h-4 mb-0.5" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>

                  {paymentMethod === "cash" && (
                    <div className="bg-[#F2FBF4] p-2.5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#2F6844]">
                          {t.pos.cashReceived}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCashReceived(String(totalDue))}
                          className="text-[11px] font-semibold text-[#15803D] hover:underline cursor-pointer"
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
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#CDE9D5] bg-white text-sm font-semibold"
                      />
                      <div className="flex justify-between text-xs font-semibold text-emerald-700">
                        <span>{t.pos.cashChange}</span>
                        <span>{formatMoney(cashChange, settings.currency_code)}</span>
                      </div>
                    </div>
                  )}

                  {paymentMethod === "qr_transfer" && (
                    <PaymentQrCard
                      settings={settings}
                      amount={totalDue}
                      reference={`TaOi${recentOrders[0] ? recentOrders[0].order_number + 1 : ""}`}
                    />
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                {canCollectCash && (
                  <button
                    type="button"
                    disabled={cart.length === 0 || submitting}
                    onClick={() => submitOrder(true)}
                    className="col-span-2 py-3 rounded-xl btn-3d-green font-extrabold text-sm cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? t.common.saving : t.pos.checkoutBtn}
                  </button>
                )}
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={() => submitOrder(false)}
                  className="py-2.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-[0_3px_0_0_#B45309]"
                >
                  {t.pos.sendOnlyBtn}
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setCart([])}
                  className="py-2.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-[0_3px_0_0_#9F1239]"
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RECENT ORDERS TODAY */}
      <div className="card-3d rounded-2xl p-4 space-y-3">
        <h2 className="font-bold text-sm text-[#14532D]">{t.pos.recentOrders}</h2>
        {recentOrders.length === 0 ? (
          <p className="text-xs text-[#2F6844]">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#CDE9D5] text-[#2F6844]">
                  <th className="py-2 pr-3">{t.pos.orderNo}</th>
                  <th className="py-2 pr-3">{t.pos.selectTable}</th>
                  <th className="py-2 pr-3">{t.common.total}</th>
                  <th className="py-2 pr-3">{t.common.status}</th>
                  <th className="py-2 pr-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDF3E4]">
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-3 font-bold text-[#14532D]">
                      #{o.order_number}
                    </td>
                    <td className="py-2.5 pr-3">
                      {o.order_type === "dine_in"
                        ? o.dining_tables?.name
                          ? translateText(o.dining_tables.name, locale)
                          : t.pos.dineIn
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
                            onClick={() => {
                              setCollectingOrder(o);
                              setCollectMethod("qr_transfer");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#16A34A] text-white font-semibold cursor-pointer"
                          >
                            {t.pos.collectPayment}
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => handlePrintOrder(o)}
                        className="p-1.5 rounded-lg border border-[#CDE9D5] hover:bg-[#F2FBF4] cursor-pointer"
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
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <div className="flex items-center gap-3">
                {activeProduct.image_url && (
                  <Image
                    src={activeProduct.image_url}
                    alt={activeProduct.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-xl object-cover border border-[#CDE9D5]"
                  />
                )}
                <div>
                  <h3 className="font-bold text-base text-[#14532D]">
                    {localizeName(activeProduct, locale)}
                  </h3>
                  <p className="text-xs text-[#15803D] font-semibold">
                    {formatMoney(activeProduct.base_price, settings.currency_code)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="p-1.5 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeProdVars.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-[#14532D]">
                  {t.pos.sizeLabel}
                </p>
                <div className="space-y-2">
                  {activeProdVars.map((v) => {
                    const q = variantQtys[v.id] ?? 0;
                    return (
                      <div
                        key={v.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          q > 0
                            ? "bg-[#EAFBF0] border-[#16A34A]"
                            : "bg-white border-[#CDE9D5]"
                        }`}
                      >
                        <div className="text-sm font-bold text-[#14532D]">
                          <span>{v.name}</span>
                          <span className="ml-2 text-[#15803D]">
                            {formatMoney(v.price, settings.currency_code)}
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-2 bg-white border border-[#CDE9D5] rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              setVariantQtys((prev) => ({
                                ...prev,
                                [v.id]: Math.max(0, (prev[v.id] ?? 0) - 1),
                              }))
                            }
                            className="p-1 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-sm w-5 text-center">
                            {q}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setVariantQtys((prev) => ({
                                ...prev,
                                [v.id]: (prev[v.id] ?? 0) + 1,
                              }))
                            }
                            className="p-1 cursor-pointer text-[#16A34A]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {toppings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#14532D]">
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
                              ? "bg-[#EAFBF0] border-[#22C55E] font-semibold text-[#14532D]"
                              : "bg-white border-[#CDE9D5] text-[#1E4D31]"
                          }`}
                        >
                          <p>{localizeName(tp, locale)}</p>
                          <p className="text-[11px] text-[#15803D]">
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
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />

            <div className="flex items-center justify-between gap-3 pt-2">
              {activeProdVars.length === 0 && (
                <div className="inline-flex items-center gap-3 border border-[#CDE9D5] rounded-xl px-3 py-1.5">
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
              )}
              <button
                type="button"
                disabled={
                  activeProdVars.length > 0 &&
                  activeProdVars.every((v) => (variantQtys[v.id] ?? 0) === 0)
                }
                onClick={addCustomizedToCart}
                className="flex-1 py-3 rounded-xl btn-3d-green text-sm font-extrabold cursor-pointer disabled:opacity-50"
              >
                {t.pos.addToCartBtn}
                {activeProdVars.length > 0 &&
                  ` (${activeProdVars.reduce(
                    (s, v) => s + (variantQtys[v.id] ?? 0),
                    0
                  )})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECT UNPAID ORDER MODAL (WITH DYNAMIC QR) */}
      {collectingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="card-3d rounded-3xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <h3 className="font-extrabold text-base text-[#14532D]">
                {t.pos.collectPayment} #{collectingOrder.order_number}
              </h3>
              <button
                type="button"
                onClick={() => setCollectingOrder(null)}
                className="p-1.5 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
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
                  onClick={() => setCollectMethod(m)}
                  className={`flex flex-col items-center py-2 px-1 rounded-xl border text-xs font-bold cursor-pointer ${
                    collectMethod === m
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-white text-[#1E4D31] border-[#CDE9D5]"
                  }`}
                >
                  <Icon className="w-4 h-4 mb-0.5" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            {collectMethod === "qr_transfer" ? (
              <PaymentQrCard
                settings={settings}
                amount={Number(collectingOrder.total_amount)}
                reference={`TaOi${collectingOrder.order_number}`}
              />
            ) : (
              <div className="p-4 rounded-2xl bg-[#F2FBF4] border border-[#CDE9D5] text-center">
                <p className="text-xs text-[#2F6844]">{t.pos.totalDue}</p>
                <p className="text-2xl font-extrabold text-[#15803D]">
                  {formatMoney(collectingOrder.total_amount, settings.currency_code)}
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={collectingBusy}
              onClick={handleConfirmCollect}
              className="w-full py-3 rounded-2xl btn-3d-green text-sm font-extrabold cursor-pointer disabled:opacity-60"
            >
              {collectingBusy ? t.common.saving : t.common.confirm}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
