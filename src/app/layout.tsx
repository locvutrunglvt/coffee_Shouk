import type { Metadata, Viewport } from "next";
import { getServerI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/I18nProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tà Ơi Coffee - Quản lý Quán",
  description:
    "Hệ thống quản lý bán hàng POS, kho nguyên liệu, cân đối và chi phí vận hành quán cà phê Tà Ơi",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tà Ơi POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#16A34A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getServerI18n();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col text-[#143321]">
        <I18nProvider locale={locale} dictionary={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
