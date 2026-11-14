import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppearanceSync } from "@/components/appearance-sync";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance-preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scholar",
  description: "Scholar",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        <Script
          id="appearance-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }}
        />
        {children}
        <AppearanceSync />
      </body>
    </html>
  );
}
