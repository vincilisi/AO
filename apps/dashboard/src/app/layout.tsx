import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Office Manager",
  description: "Centro operativo aziendale intelligente"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}