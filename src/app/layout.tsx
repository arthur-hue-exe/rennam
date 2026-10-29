import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pressStart = localFont({
  src: "./fonts/PressStart2P-Regular.ttf",
  variable: "--font-press-start",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Rennam Torado | Placar global de toradas",
  description:
    "Aperte TORAR!, dê uma cabeçada no bloco e aumente o placar global em tempo real. Cada torada conta para o mundo inteiro.",
  applicationName: "Rennam Torado",
  keywords: ["Rennam Torado", "contador global", "minigame", "pixel art", "Super Mario World"],
  openGraph: {
    title: "Rennam Torado",
    description: "Aperte TORAR! e veja o contador global subir em tempo real.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5c94fc",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={pressStart.variable}>
      <body>{children}</body>
    </html>
  );
}
