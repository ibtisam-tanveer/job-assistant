import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Assistant",
  description: "Discover jobs, tailor documents, track applications",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
