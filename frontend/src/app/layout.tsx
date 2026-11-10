import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import "./globals.css";

// Geist: la familia ya autorizada en la interfaz de INFOGRED (licencia SIL OFL). El logo lleva su tipografía incorporada al gráfico.
const fuente = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-sgred", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: "Seguimiento SGRED",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fuente.variable}>
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
