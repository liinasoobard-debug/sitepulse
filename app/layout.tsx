import type { Metadata } from "next";
import "./globals.css";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "SitePulse",
  description: "Construction records and site evidence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <AppChrome>{children}</AppChrome>
        </div>
      </body>
    </html>
  );
}
