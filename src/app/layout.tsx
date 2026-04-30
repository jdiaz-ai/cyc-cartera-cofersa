import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CYC Cofersa — Gestión de Cartera",
  description: "Plataforma de Crédito y Cobro — Cofersa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${nunito.variable} h-full`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-nunito)] antialiased">
        {children}
      </body>
    </html>
  );
}
