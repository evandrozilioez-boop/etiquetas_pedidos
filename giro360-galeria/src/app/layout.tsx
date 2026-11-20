import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Giro 360 | Galeria de Eventos", template: "%s | Giro 360" },
  description: "Fotos do totem e vídeos da Plataforma 360 dos eventos da Giro 360.",
  applicationName: "Giro 360",
  appleWebApp: { capable: true, title: "Giro 360", statusBarStyle: "black-translucent" },
  icons: { icon: "/brand/giro360-logo.png", apple: "/brand/giro360-logo.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141118",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
