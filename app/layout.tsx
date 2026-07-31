import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ProjectSelector from "@/components/ProjectSelector";

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
          <ProjectSelector />
          {children}
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
