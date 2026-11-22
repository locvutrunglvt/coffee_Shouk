/**
 * EMVCo Merchant-Presented QR utilities (supports both LaoQR / BCEL One & VietQR)
 * plus VietQR image URL builder.
 */

interface TlvTag {
  tag: string;
  value: string;
}

function parseEmvcoTlv(payload: string): TlvTag[] {
  const tags: TlvTag[] = [];
  let i = 0;
  const clean = payload.trim();
  while (i + 4 <= clean.length) {
    const tag = clean.slice(i, i + 2);
    const len = parseInt(clean.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len) || i + 4 + len > clean.length) break;
    const value = clean.slice(i + 4, i + 4 + len);
    tags.push({ tag, value });
    i += 4 + len;
  }
  return tags;
}

function formatTlv(tag: string, value: string): string {
  const lenStr = String(value.length).padStart(2, "0");
  return `${tag}${lenStr}${value}`;
}

function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Takes a static EMVCo QR string (e.g. LaoQR / BCEL One / VietQR), injects
 * exact amount in Tag 54, updates Point of Initiation (Tag 01 = '12'),
 * optionally sets Bill Number in Tag 62 if absent, and recomputes CRC-16 (Tag 63).
 */
export function buildEmvcoDynamicQr(
  baseQr: string,
  amount: number,
  reference?: string
): string | null {
  const clean = baseQr.trim();
  if (!clean.startsWith("000201")) return null;

  const parsed = parseEmvcoTlv(clean).filter((t) => t.tag !== "63");
  if (parsed.length < 3) return null;

  const updated: TlvTag[] = [];
  let has01 = false;
  let has54 = false;
  let has62 = false;

  const amountStr = String(Math.max(0, Math.round(amount)));

  for (const item of parsed) {
    if (item.tag === "01") {
      has01 = true;
      updated.push({ tag: "01", value: amount > 0 ? "12" : "11" });
    } else if (item.tag === "54") {
      has54 = true;
      if (amount > 0) updated.push({ tag: "54", value: amountStr });
    } else if (item.tag === "62") {
      has62 = true;
      updated.push(item);
    } else {
      updated.push(item);
    }
  }

  if (!has01) {
    updated.splice(1, 0, { tag: "01", value: amount > 0 ? "12" : "11" });
  }

  if (!has54 && amount > 0) {
    const idx58 = updated.findIndex((t) => Number(t.tag) >= 58);
    const tag54 = { tag: "54", value: amountStr };
    if (idx58 >= 0) updated.splice(idx58, 0, tag54);
    else updated.push(tag54);
  }

  if (!has62 && reference) {
    const cleanRef = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
    if (cleanRef) {
      updated.push({ tag: "62", value: formatTlv("01", cleanRef) });
    }
  }

  const bodyWithoutCrc =
    updated.map((t) => formatTlv(t.tag, t.value)).join("") + "6304";
  const crc = crc16Ccitt(bodyWithoutCrc);
  return `${bodyWithoutCrc}${crc}`;
}

export const VIETQR_BANKS = [
  { id: "VCB", name: "Vietcombank" },
  { id: "MB", name: "MB Bank" },
  { id: "TCB", name: "Techcombank" },
  { id: "BIDV", name: "BIDV" },
  { id: "CTG", name: "VietinBank" },
  { id: "ACB", name: "ACB" },
  { id: "VPB", name: "VPBank" },
  { id: "TPB", name: "TPBank" },
  { id: "VIB", name: "VIB" },
  { id: "STB", name: "Sacombank" },
  { id: "SHB", name: "SHB" },
  { id: "HDB", name: "HDBank" },
  { id: "OCB", name: "OCB" },
  { id: "MSB", name: "MSB" },
  { id: "VBA", name: "Agribank" },
];

export function buildVietQrImageUrl(params: {
  bankId: string;
  accountNo: string;
  accountName?: string;
  amount: number;
  addInfo: string;
}): string {
  const { bankId, accountNo, accountName, amount, addInfo } = params;
  const query = new URLSearchParams({
    amount: String(Math.max(0, Math.round(amount))),
    addInfo,
  });
  if (accountName?.trim()) {
    query.set("accountName", accountName.trim());
  }
  return `https://img.vietqr.io/image/${encodeURIComponent(
    bankId
  )}-${encodeURIComponent(accountNo)}-compact2.png?${query.toString()}`;
}
