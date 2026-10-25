import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { KeyGate } from "@/components/chrome/KeyGate";
import { brand } from "@/lib/brand";
import { Footer } from "@/components/chrome/Footer";

// Humanist sans close to Toyota Type (which is licensed and not ours to ship).
const sourceSans = Source_Sans_3({ variable: "--font-source", subsets: ["latin"], weight: ["300", "400", "600", "700"] });

export const metadata: Metadata = {
  title: brand.product,
  description: brand.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sourceSans.variable} min-h-screen flex flex-col`}>
        <KeyGate>{children}</KeyGate>
        <Footer />
      </body>
    </html>
  );
}
