import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Office Manager",
    short_name: "AI Office",
    description: "Centro operativo intelligente per email, clienti, preventivi e team.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f4",
    theme_color: "#102f25",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
