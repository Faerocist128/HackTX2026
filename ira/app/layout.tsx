import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { KeyGate } from "@/components/chrome/KeyGate";
import { brand } from "@/lib/brand";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: brand.product,
  description: brand.tagline,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} min-h-screen flex flex-col`}><KeyGate>{children}</KeyGate></body>
    </html>
  );
}
