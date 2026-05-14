import type { Metadata } from "next";
import { Cardo, Cormorant_Garamond } from "next/font/google";

import { TopNavigation } from "@/components/top-navigation";

import "./globals.css";

const bodyFont = Cardo({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-cardo",
});

const titleFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-title",
});

export const metadata: Metadata = {
  title: "HP/VVS Meta Ads AI Analyst",
  description: "Internal read-only Meta Ads intelligence dashboard for HP and VVS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${titleFont.variable}`}>
      <body>
        <TopNavigation />
        {children}
      </body>
    </html>
  );
}
