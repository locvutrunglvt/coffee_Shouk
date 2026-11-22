import type { Metadata, Viewport } from "next";
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
  themeColor: "#4A2C18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#FAF7F2] text-[#231810]">
        {children}
      </body>
    </html>
  );
}
