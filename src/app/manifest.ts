import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ta Oi Coffee - Quản lý Quán",
    short_name: "Ta Oi POS",
    description:
      "Hệ thống quản lý bán hàng, kho nguyên liệu, cân đối và chi phí quán cà phê Ta Oi",
    start_url: "/",
    display: "standalone",
    background_color: "#F2FBF4",
    theme_color: "#16A34A",
    icons: [
      {
        src: "/logo-taoi.jpeg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/logo-taoi.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
