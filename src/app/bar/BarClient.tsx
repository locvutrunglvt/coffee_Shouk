"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/components/I18nProvider";
import { CheckCircle2, Clock, Coffee, RefreshCw } from "lucide-react";

export interface BarOrderItem {
  id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  toppings_json: { name: string }[];
  note: string;
}

export interface BarOrder {
  id: string;
  order_number: number;
  order_type: "dine_in" | "take_away" | "delivery";
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  note: string;
  created_at: string;
  dining_tables: { name: string } | null;
  order_items: BarOrderItem[];
}

interface BarClientProps {
  initialOrders: BarOrder[];
}

export function BarClient({ initialOrders }: BarClientProps) {
  const { t } = useT();
  const [orders, setOrders] = useState<BarOrder[]>(initialOrders);
  const [tab, setTab] = useState<"pending" | "preparing" | "ready">("pending");
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  async function fetchActiveOrders() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("orders")
        .select(
          "id, order_number, order_type, status, note, created_at, dining_tables(name), order_items(id, product_name, variant_name, quantity, toppings_json, note)"
        )
        .in("status", ["pending", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (data) {
        setOrders(data as unknown as BarOrder[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("bar-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchActiveOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          fetchActiveOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function updateStatus(
    orderId: string,
    nextStatus: "preparing" | "ready" | "completed"
  ) {
    const supabase = createClient();
    const updatePayload: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "completed") {
      updatePayload.completed_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);
    if (!error) {
      if (nextStatus === "completed") {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        );
      }
    }
  }

  function formatElapsed(createdAt: string) {
    const diffMin = Math.max(
      0,
      Math.floor((nowMs - new Date(createdAt).getTime()) / 60000)
    );
    return diffMin === 0 ? t.bar.justNow : `${diffMin} ${t.bar.minAgo}`;
  }

  function orderTypeLabel(o: BarOrder) {
    if (o.order_type === "dine_in") {
      return o.dining_tables?.name ?? t.pos.dineIn;
    }
    if (o.order_type === "take_away") return t.pos.takeAway;
    return t.pos.delivery;
  }

  const filtered = orders.filter((o) => o.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 bg-white p-1 rounded-xl border border-[#CDE9D5]">
          {(
            [
              ["pending", t.bar.pendingTab],
              ["preparing", t.bar.preparingTab],
              ["ready", t.bar.readyTab],
            ] as const
          ).map(([statusKey, label]) => {
            const count = orders.filter((o) => o.status === statusKey).length;
            return (
              <button
                key={statusKey}
                type="button"
                onClick={() => setTab(statusKey)}
                className={`px-3.5 py-2 rounded-lg text-sm sm:text-base font-semibold cursor-pointer flex items-center gap-1.5 ${
                  tab === statusKey
                    ? "bg-[#16A34A] text-white"
                    : "text-[#1E4D31] hover:bg-[#EAFBF0]"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[11px] ${
                    tab === statusKey
                      ? "bg-white/20 text-white"
                      : "bg-[#EAFBF0] text-[#14532D]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {t.bar.realtimeBadge}
          </span>
          <button
            type="button"
            onClick={fetchActiveOrders}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#CDE9D5] bg-white text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{t.common.refresh}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-3d rounded-2xl p-10 text-center space-y-2 text-[#2F6844]">
          <Coffee className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm">{t.bar.noOrders}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((o) => (
            <div
              key={o.id}
              className="card-3d rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-2.5">
                  <div>
                    <span className="text-base font-bold text-[#14532D]">
                      #{o.order_number}
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-lg bg-[#EAFBF0] text-xs font-semibold text-[#14532D]">
                      {orderTypeLabel(o)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-[#2F6844]">
                    <Clock className="w-3.5 h-3.5" />
                    {formatElapsed(o.created_at)}
                  </span>
                </div>

                <ul className="space-y-2">
                  {o.order_items.map((item) => (
                    <li
                      key={item.id}
                      className="p-2.5 rounded-xl bg-[#F2FBF4] border border-[#DDF3E4]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-sm text-[#14532D]">
                          {item.quantity}x {item.product_name}
                          {item.variant_name ? ` (${item.variant_name})` : ""}
                        </span>
                      </div>
                      {Array.isArray(item.toppings_json) &&
                        item.toppings_json.length > 0 && (
                          <p className="text-xs text-[#2F6844] mt-0.5">
                            + {item.toppings_json.map((tp) => tp.name).join(", ")}
                          </p>
                        )}
                      {item.note && (
                        <p className="mt-1 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold">
                          {item.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                {o.note && (
                  <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-900">
                    {t.common.note}: {o.note}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-[#DDF3E4]">
                {o.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(o.id, "preparing")}
                    className="w-full py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold cursor-pointer"
                  >
                    {t.bar.startMaking}
                  </button>
                )}
                {o.status === "preparing" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(o.id, "ready")}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                  >
                    {t.bar.markReady}
                  </button>
                )}
                {o.status === "ready" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(o.id, "completed")}
                    className="w-full py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.bar.completeOrder}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
