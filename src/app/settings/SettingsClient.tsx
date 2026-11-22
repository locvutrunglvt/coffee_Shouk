"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";
import { type UserRole } from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";
import { compressAndUploadImage } from "@/lib/uploadImage";
import {
  CheckCircle2,
  Save,
  Store,
  Users,
  AlertCircle,
  Upload,
} from "lucide-react";

interface SettingsClientProps {
  initialSettings: ShopSettings;
  initialProfiles: UserProfile[];
  currentUserId: string;
}

const ROLES: UserRole[] = ["admin", "manager", "cashier", "staff", "barista"];

export function SettingsClient({
  initialSettings,
  initialProfiles,
  currentUserId,
}: SettingsClientProps) {
  const router = useRouter();
  const { t } = useT();
  const [settings, setSettings] = useState(initialSettings);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const url = await compressAndUploadImage(file, "qr");
      setSettings((prev) => ({ ...prev, qr_image_url: url }));
    } catch {
      setNotice({ type: "err", text: t.common.error });
    } finally {
      setUploadingQr(false);
    }
  }

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
      setNotice({ type: "ok", text: t.settings.settingsSaved });
      router.refresh();
    } catch {
      setNotice({ type: "err", text: t.settings.settingsError });
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
      setNotice({ type: "ok", text: t.settings.roleUpdated });
    } catch {
      setNotice({ type: "err", text: t.settings.roleError });
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

      <form
        onSubmit={handleSaveSettings}
        className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 text-[#4A2C18] font-bold">
          <Store className="w-5 h-5 text-[#C97B36]" />
          <h2>{t.settings.shopInfoTitle}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              {t.settings.shopName}
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
              {t.settings.currencyLabel}
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
              {t.settings.shopPhone}
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
              {t.settings.shopAddress}
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
              {t.settings.bankInfo}
            </label>
            <input
              type="text"
              placeholder="BCEL One - 010123456789 - TAOI COFFEE"
              value={settings.bank_info ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_info: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A3828] mb-1">
              {t.settings.qrImageUrl}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="https://..."
                value={settings.qr_image_url ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, qr_image_url: e.target.value })
                }
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-[#E7DDD0]"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7DDD0] bg-[#FAF7F2] hover:bg-[#F3ECE2] text-xs font-medium cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingQr ? t.common.loading : "QR"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrFileChange}
                  className="hidden"
                />
              </label>
            </div>
            {settings.qr_image_url && (
              <div className="mt-2">
                <Image
                  src={settings.qr_image_url}
                  alt="QR"
                  width={112}
                  height={112}
                  className="w-28 h-28 object-contain rounded-xl border border-[#E7DDD0] bg-white p-1"
                />
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={savingSettings}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-semibold hover:bg-[#3A2212] cursor-pointer disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          <span>{savingSettings ? t.common.saving : t.settings.saveSettingsBtn}</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-[#E7DDD0] p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#4A2C18] font-bold">
            <Users className="w-5 h-5 text-[#C97B36]" />
            <h2>
              {t.settings.staffTitle} ({profiles.length})
            </h2>
          </div>
          <p className="text-xs text-[#7B6554]">{t.settings.staffHint}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#E7DDD0] text-xs text-[#7B6554]">
                <th className="py-2.5 pr-4">{t.settings.colName}</th>
                <th className="py-2.5 pr-4">{t.settings.colEmail}</th>
                <th className="py-2.5 pr-4">{t.settings.colRole}</th>
                <th className="py-2.5 pr-4">{t.settings.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3ECE2]">
              {profiles.map((p) => {
                const isSelf = p.id === currentUserId;
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-medium">
                      {p.full_name || p.email}
                      {isSelf && (
                        <span className="ml-2 text-[11px] text-[#C97B36] font-semibold">
                          {t.settings.youTag}
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
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t.roles[r]}
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
                        {p.is_active ? t.common.active : t.common.locked}
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
