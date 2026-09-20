import type { Metadata, Viewport } from "next";
import { Geist, Rajdhani } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "RAJA GAMING — Free Fire Top-Up, Tournaments & ID Marketplace",
    template: "%s | RAJA GAMING",
  },
  description:
    "RAJA GAMING — instant Free Fire diamond top-up, competitive tournaments, and a safe admin-verified ID marketplace. Gaming • Tournaments • Rewards • Community.",
  keywords: [
    "RAJA GAMING",
    "Free Fire diamonds",
    "Free Fire top up",
    "Free Fire tournaments",
    "Free Fire ID marketplace",
    "EasyPaisa top up",
    "gaming community",
  ],
  verification: {
    google: "RG2j2zw2EAkXnyXCdnF6xCVLs4nmuLfo1VSk5dNbq50",
  },
  applicationName: "RAJA GAMING",
  authors: [{ name: "RAJA GAMING" }],
  alternates: { canonical: "/" },
  openGraph: {
    title: "RAJA GAMING — Gaming • Tournaments • Rewards • Community",
    description:
      "Instant Free Fire diamond top-up, competitive tournaments, and a safe admin-verified ID marketplace.",
    url: APP_URL,
    siteName: "RAJA GAMING",
    type: "website",
    images: [{ url: "/images/og.jpg", width: 1200, height: 630, alt: "RAJA GAMING" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RAJA GAMING — Gaming • Tournaments • Rewards • Community",
    description: "Instant Free Fire top-up, tournaments and a safe ID marketplace.",
    images: ["/images/og.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${rajdhani.variable} font-sans min-h-screen`}>
        <SessionProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </SessionProvider>
      </body>
    </html>
  );
}
