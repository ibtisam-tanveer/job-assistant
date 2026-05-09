import type { Metadata, Viewport } from "next";
import { Inter, Syne } from "next/font/google";
import { SiteHeader } from "./components/SiteHeader";
import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Job Assistant",
  description: "Discover jobs, tailor documents, track applications",
};

export const viewport: Viewport = {
  themeColor: "#06060a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className={sans.className}>
        <div className="ja-shell">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
