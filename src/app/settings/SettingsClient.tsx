"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";
import { ROLE_META, type UserRole } from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { CheckCircle2, Save, Store, Users, AlertCircle } from "lucide-react";

interface SettingsClientProps {
  initialSettings: ShopSettings;
  initialProfiles: UserProfile[];
  currentUserId: string;
}

export function SettingsClient({
  initialSettings,
  initialProfiles,
  currentUserId,
}: SettingsClientProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const currency =
        CURRENCIES[
          (settings.currency_code as CurrencyCode) in CURRENCIES
            ? (settings.currency_code as CurrencyCode)
            : "LAK"
        ];
      const { error } = await supabase
        .from("shop_settings")
        .update({
          shop_name: settings.shop_name,
          address: settings.address,
          phone: settings.phone,
          currency_code: currency.code,
          currency_symbol: currency.symbol,
          bank_info: settings.bank_info,
          qr_image_url: settings.qr_image_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;
      setNotice({ type: "ok", text: "Đã lưu cài đặt quán và đơn vị tiền tệ." });
      router.refresh();
    } catch {
      setNotice({ type: "err", text: "Không thể lưu cài đặt. Kiểm tra quyền Admin." });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleUpdateRole(userId: string, role: UserRole, isActive: boolean) {
    setSavingUserId(userId);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ role, is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, role, is_active: isActive } : p))
      );
      setNotice({ type: "ok", text: "Đã cập nhật phân quyền nhân viên." });
    } catch {
      setNotice({ type: "err", text: "Lỗi khi cập nhật quyền nhân viên." });
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
            notice.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {notice.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Shop Settings Card */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 text-[#4A2C18] font-bold">
          <Store className="w-5 h-5 text-[#C97B36]" />
          <h2>Thông tin quán & Tiền tệ</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Tên quán
            </label>
            <input
              type="text"
              required
              value={settings.shop_name}
              onChange={(e) =>
                setSettings({ ...settings, shop_name: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Đơn vị tiền tệ hiển thị
            </label>
            <select
              value={settings.currency_code}
              onChange={(e) => {
                const code = e.target.value as CurrencyCode;
                setSettings({
                  ...settings,
                  currency_code: code,
                  currency_symbol: CURRENCIES[code].symbol,
                });
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0] bg-white"
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Số điện thoại quán
            </label>
            <input
              type="text"
              value={settings.phone ?? ""}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Địa chỉ
            </label>
            <input
              type="text"
              value={settings.address ?? ""}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Thông tin tài khoản ngân hàng (in trên bill / màn hình QR)
            </label>
            <input
              type="text"
              placeholder="VD: BCEL One - 010123456789 - TAOI COFFEE"
              value={settings.bank_info ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_info: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              Link ảnh QR chuyển khoản (LaoQR / VietQR)
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={settings.qr_image_url ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, qr_image_url: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingSettings}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-semibold hover:bg-[#3A2212] cursor-pointer disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          <span>{savingSettings ? "Đang lưu..." : "Lưu cài đặt quán"}</span>
        </button>
      </form>

      {/* Staff & Role Management */}
      <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#4A2C18] font-bold">
            <Users className="w-5 h-5 text-[#C97B36]" />
            <h2>Phân quyền tài khoản nhân sự ({profiles.length})</h2>
          </div>
          <p className="text-xs text-[#7B6554]">
            Nhân viên tự đăng ký tại trang đăng nhập, sau đó Chủ quán gán vai trò tại đây.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#E7DDD0] text-xs text-[#7B6554]">
                <th className="py-2.5 pr-4">Họ tên</th>
                <th className="py-2.5 pr-4">Email</th>
                <th className="py-2.5 pr-4">Vai trò</th>
                <th className="py-2.5 pr-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3ECE2]">
              {profiles.map((p) => {
                const isSelf = p.id === currentUserId;
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-medium">
                      {p.full_name || "Chưa đặt tên"}
                      {isSelf && (
                        <span className="ml-2 text-[11px] text-[#C97B36] font-semibold">
                          (Bạn)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#7B6554]">{p.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        disabled={isSelf || savingUserId === p.id}
                        value={p.role}
                        onChange={(e) =>
                          handleUpdateRole(p.id, e.target.value as UserRole, p.is_active)
                        }
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-[#E7DDD0] bg-white disabled:opacity-60"
                      >
                        {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_META[r].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        disabled={isSelf || savingUserId === p.id}
                        onClick={() => handleUpdateRole(p.id, p.role, !p.is_active)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer disabled:opacity-60 ${
                          p.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {p.is_active ? "Đang hoạt động" : "Đã khóa"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
