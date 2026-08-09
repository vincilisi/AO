import type { Metadata, Viewport } from "next";
import { PwaRegister } from "../components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Office Manager",
  description: "Centro operativo aziendale intelligente",
  applicationName: "AI Office Manager",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AI Office" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102f25"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}