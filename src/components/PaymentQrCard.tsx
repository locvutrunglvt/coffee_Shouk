"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildEmvcoDynamicQr, buildVietQrImageUrl } from "@/lib/emvcoQr";
import { formatMoney } from "@/lib/format";
import type { ShopSettings } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";

interface PaymentQrCardProps {
  settings: ShopSettings;
  amount: number;
  reference?: string;
}

export function PaymentQrCard({
  settings,
  amount,
  reference = "TaOi",
}: PaymentQrCardProps) {
  const { t } = useT();
  const [emvcoResult, setEmvcoResult] = useState<{
    payload: string;
    url: string;
  } | null>(null);

  const mode = settings.qr_mode ?? "image";
  const hasVietQr =
    mode === "vietqr" &&
    Boolean(settings.vietqr_bank_id?.trim()) &&
    Boolean(settings.vietqr_account_no?.trim());

  const dynamicEmvcoPayload =
    mode === "emvco" && settings.emvco_base_qr
      ? buildEmvcoDynamicQr(settings.emvco_base_qr, amount, reference)
      : null;

  useEffect(() => {
    let active = true;
    if (!dynamicEmvcoPayload) return;
    QRCode.toDataURL(dynamicEmvcoPayload, {
      width: 240,
      margin: 2,
      color: { dark: "#143321", light: "#FFFFFF" },
    })
      .then((url) => {
        if (active) setEmvcoResult({ payload: dynamicEmvcoPayload, url });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dynamicEmvcoPayload]);

  const emvcoDataUrl =
    dynamicEmvcoPayload && emvcoResult?.payload === dynamicEmvcoPayload
      ? emvcoResult.url
      : "";

  const vietQrUrl = hasVietQr
    ? buildVietQrImageUrl({
        bankId: settings.vietqr_bank_id!,
        accountNo: settings.vietqr_account_no!,
        accountName: settings.vietqr_account_name,
        amount,
        addInfo: reference,
      })
    : "";

  return (
    <div className="bg-[#F2FBF4] p-3.5 rounded-2xl text-center space-y-2 border-2 border-[#CDE9D5]">
      <p className="text-xs font-medium text-[#2F6844]">{t.pos.qrScanHint}</p>

      <p className="text-lg font-extrabold text-[#15803D]">
        {formatMoney(amount, settings.currency_code)}
      </p>

      {hasVietQr ? (
        <Image
          src={vietQrUrl}
          alt="VietQR"
          width={180}
          height={180}
          className="w-44 h-44 mx-auto object-contain rounded-xl bg-white p-1.5 border border-[#CDE9D5]"
        />
      ) : emvcoDataUrl ? (
        <Image
          src={emvcoDataUrl}
          alt="EMVCo QR"
          width={180}
          height={180}
          className="w-44 h-44 mx-auto object-contain rounded-xl bg-white p-1.5 border border-[#CDE9D5]"
        />
      ) : settings.qr_image_url ? (
        <Image
          src={settings.qr_image_url}
          alt="Payment QR"
          width={160}
          height={160}
          className="w-40 h-40 mx-auto object-contain rounded-xl bg-white p-1.5 border border-[#CDE9D5]"
        />
      ) : (
        <p className="text-xs text-amber-800">{t.pos.noQrConfigured}</p>
      )}

      {settings.bank_info && (
        <p className="text-xs font-bold text-[#14532D]">{settings.bank_info}</p>
      )}
    </div>
  );
}
