import type { Locale } from "./types";

interface LocalizedPair {
  en: string;
  lo: string;
}

const CATALOG_DICT: Record<string, LocalizedPair> = {
  // Categories
  "đồ uống": { en: "Beverages", lo: "ເຄື່ອງດື່ມ" },
  "cà phê": { en: "Coffee", lo: "ກາເຟ" },
  "trà sữa & matcha": { en: "Milk Tea & Matcha", lo: "ຊານົມ & ມັດຊະ" },
  "trà sữa": { en: "Milk Tea", lo: "ຊານົມ" },
  "trà trái cây & ép": { en: "Fruit Tea & Juice", lo: "ຊາໝາກໄມ້ & ນ້ຳໝາກໄມ້" },
  "trà trái cây": { en: "Fruit Tea", lo: "ຊາໝາກໄມ້" },
  "đá xay & bánh": { en: "Frappe & Bakery", lo: "ປັ່ນ & ເຂົ້າໜົມ" },
  "đá xay & khác": { en: "Frappe & Others", lo: "ປັ່ນ & ອື່ນໆ" },
  "bánh ngọt": { en: "Bakery", lo: "ເຂົ້າໜົມ" },

  // Drinks
  "cà phê đen đá": { en: "Iced Black Coffee", lo: "ກາເຟດຳເຢັນ" },
  "cà phê sữa đá": { en: "Iced Milk Coffee", lo: "ກາເຟນົມເຢັນ" },
  "bạc xỉu 3 tầng": { en: "3-Layer White Coffee", lo: "ບັກຊິວ 3 ຊັ້ນ" },
  "bạc xỉu": { en: "Iced White Coffee", lo: "ກາເຟນົມສົດ" },
  "americano đá": { en: "Iced Americano", lo: "ອາເມຣິກາໂນເຢັນ" },
  "latte nóng": { en: "Hot Caffe Latte", lo: "ລາເຕ້ຮ້ອນ" },
  "matcha latte đá": { en: "Iced Matcha Latte", lo: "ມັດຊະລາເຕ້ເຢັນ" },
  "trà sữa trân châu đường đen": {
    en: "Brown Sugar Boba Milk Tea",
    lo: "ຊານົມໄຂ່ມຸກນ້ຳຕານດຳ",
  },
  "trà sữa trân châu": { en: "Boba Milk Tea", lo: "ຊານົມໄຂ່ມຸກ" },
  "trà đào cam sả": { en: "Peach Orange Lemongrass Tea", lo: "ຊາພີດໝາກກ້ຽງຫົວສີໄຄ" },
  "trà đào": { en: "Peach Iced Tea", lo: "ຊາພີດ" },
  "trà vải hoa hồng": { en: "Lychee Rose Iced Tea", lo: "ຊາລິ້ນຈີ່ກຸຫຼາບ" },
  "trà chanh sả tắc": {
    en: "Lime Lemongrass Kumquat Tea",
    lo: "ຊາໝາກນາວຫົວສີໄຄ",
  },
  "sinh tố xoài": { en: "Mango Smoothie", lo: "ໝາກມ່ວງປັ່ນ" },
  "đá xay socola kem tươi": {
    en: "Chocolate Ice Blended",
    lo: "ຊັອກໂກແລັດປັ່ນຄຣີມສົດ",
  },
  "soda việt quất bạc hà": {
    en: "Blueberry Mint Soda",
    lo: "ໂຊດາບລູເບີຣີ່ມິ້ນ",
  },
  "nước cam ép tươi": { en: "Fresh Orange Juice", lo: "ນ້ຳໝາກກ້ຽງຄັ້ນສົດ" },
  "cam ép": { en: "Orange Juice", lo: "ນ້ຳໝາກກ້ຽງຄັ້ນ" },
  "bánh croissant bơ": { en: "Butter Croissant", lo: "ເຂົ້າຈີ່ຄຣົວຊອງເນີຍ" },

  // Descriptions
  "đậm vị cà phê rang mộc truyền thống": {
    en: "Bold traditional roasted black coffee",
    lo: "ກາເຟຄົ່ວສົດລົດຊາດເຂັ້ມຂຸ້ນດັ້ງເດີມ",
  },
  "cà phê phin hòa quyện sữa đặc béo thơm": {
    en: "Rich drip coffee blended with condensed milk",
    lo: "ກາເຟປະສົມນົມຂຸ້ນຫວານມັນຫອມ",
  },
  "sữa tươi nhiều, ngọt dịu nhẹ nhàng": {
    en: "Creamy fresh milk with mild coffee sweetness",
    lo: "ນົມສົດຫຼາຍ ຫວານນຸ້ມລະມຸນ",
  },
  "espresso pha loãng mát lạnh thanh nhẹ": {
    en: "Refreshing chilled espresso over crystal ice",
    lo: "ເອສເປຣສໂຊເຢັນສົດຊື່ນ",
  },
  "espresso cùng bọt sữa mịn nghệ thuật": {
    en: "Smooth espresso with velvety latte art foam",
    lo: "ເອສເປຣສໂຊກັບຟອງນົມນຽນນຸ້ມ",
  },
  "trà xanh nhật bản thơm mát béo dịu": {
    en: "Japanese matcha green tea over fresh milk",
    lo: "ຊາຂຽວມັດຊະຍີ່ປຸ່ນຫອມມັນ",
  },
  "hồng trà sữa kèm trân châu dai mềm": {
    en: "Creamy black milk tea with chewy boba pearls",
    lo: "ຊານົມຫອມມັນພ້ອມໄຂ່ມຸກໜຽວນຸ້ມ",
  },
  "trà đào thanh mát hương cam sả tự nhiên": {
    en: "Refreshing peach tea with orange & lemongrass",
    lo: "ຊາພີດເຢັນຊື່ນໃຈກິ່ນໝາກກ້ຽງຫົວສີໄຄ",
  },
  "vị vải ngọt thanh kết hợp hương hoa hồng": {
    en: "Sweet lychee fruit tea with fragrant rose",
    lo: "ລົດລິ້ນຈີ່ຫວານຊື່ນກິ່ນດອກກຸຫຼາບ",
  },
  "giải nhiệt sảng khoái chua ngọt dịu": {
    en: "Zesty sweet-sour citrus refresher",
    lo: "ເຄື່ອງດື່ມສົດຊື່ນສົ້ມຫວານພໍດີ",
  },
  "xoài chín xay mịn mát lạnh tự nhiên": {
    en: "Smooth blended ripe tropical mango",
    lo: "ໝາກມ່ວງສຸກປັ່ນລະອຽດເຢັນຊື່ນໃຈ",
  },
  "socola đậm vị phủ kem tươi béo ngậy": {
    en: "Rich blended chocolate topped with whipped cream",
    lo: "ຊັອກໂກແລັດເຂັ້ມຂຸ້ນໂປະຄຣີມສົດ",
  },
  "soda có ga mát lạnh hương việt quất": {
    en: "Sparkling blueberry soda with fresh mint",
    lo: "ໂຊດາຊ່າເຢັນສົດຊື່ນລົດບລູເບີຣີ່",
  },
  "cam tươi vắt 100% bổ sung vitamin c": {
    en: "100% freshly squeezed vitamin C orange juice",
    lo: "ນ້ຳໝາກກ້ຽງຄັ້ນສົດ 100% ວິຕາມິນ C",
  },
  "bánh sừng bò nướng giòn thơm bơ pháp": {
    en: "Flaky golden French butter croissant",
    lo: "ເຂົ້າຈີ່ຄຣົວຊອງອົບກອບຫອມເນີຍ",
  },

  // Toppings
  "trân châu đường đen": { en: "Brown Sugar Boba", lo: "ໄຂ່ມຸກນ້ຳຕານດຳ" },
  "trân châu đen": { en: "Black Boba", lo: "ໄຂ່ມຸກດຳ" },
  "kem cheese / foam milk": { en: "Cheese Foam", lo: "ຄຣີມຊີສ / ໂຟມນົມ" },
  "kem cheese": { en: "Cheese Foam", lo: "ຄຣີມຊີສ" },
  "thạch đào / vải": { en: "Peach / Lychee Jelly", lo: "ວຸ້ນພີດ / ລິ້ນຈີ່" },
  "thạch dừa": { en: "Coconut Jelly", lo: "ວຸ້ນໝາກພ້າວ" },
  "thêm shot espresso": { en: "Extra Espresso Shot", lo: "ເພີ່ມຊັອດເອສເປຣສໂຊ" },

  // Zones
  "trong nhà": { en: "Indoor", lo: "ໃນຮ້ານ" },
  "ngoài trời": { en: "Outdoor", lo: "ນອກຮ້ານ" },
  "tầng 2": { en: "2nd Floor", lo: "ຊັ້ນ 2" },
};

export interface LocalizableEntity {
  name: string;
  name_en?: string | null;
  name_lo?: string | null;
}

export function localizeName(
  entity: LocalizableEntity | string | null | undefined,
  locale: Locale
): string {
  if (!entity) return "";
  if (typeof entity === "string") {
    return translateText(entity, locale);
  }
  if (locale === "en" && entity.name_en?.trim()) return entity.name_en.trim();
  if (locale === "lo" && entity.name_lo?.trim()) return entity.name_lo.trim();
  return translateText(entity.name, locale);
}

export function localizeDescription(
  desc: string | null | undefined,
  descEn: string | null | undefined,
  descLo: string | null | undefined,
  locale: Locale
): string {
  if (locale === "en" && descEn?.trim()) return descEn.trim();
  if (locale === "lo" && descLo?.trim()) return descLo.trim();
  if (!desc) return "";
  return translateText(desc, locale);
}

export function translateText(raw: string, locale: Locale): string {
  const trimmed = raw.trim();
  if (!trimmed || locale === "vi") return raw;

  const key = trimmed.toLowerCase();
  const exact = CATALOG_DICT[key];
  if (exact) {
    return locale === "en" ? exact.en : exact.lo;
  }

  // Pattern match table names like "Bàn 1", "Sân vườn 2"
  const banMatch = /^bàn\s+(.+)$/i.exec(trimmed);
  if (banMatch) {
    return locale === "en" ? `Table ${banMatch[1]}` : `ໂຕະ ${banMatch[1]}`;
  }

  const gardenMatch = /^sân vườn\s+(.+)$/i.exec(trimmed);
  if (gardenMatch) {
    return locale === "en"
      ? `Garden ${gardenMatch[1]}`
      : `ສວນ ${gardenMatch[1]}`;
  }

  return raw;
}
