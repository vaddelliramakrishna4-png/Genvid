import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
};

export const metadata: Metadata = {
  title: "GenVid",
  description: "One sentence in. A ready-to-post reel out.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GenVid",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="app-container">
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden", position: "relative" }}>
            {children}
          </main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
