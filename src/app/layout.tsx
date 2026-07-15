import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false, // large CJK font — skip preload
});

export const metadata: Metadata = {
  title: "KIKU",
  description: "Japanese podcast study app",
  appleWebApp: {
    capable: true,
    title: "KIKU",
    statusBarStyle: "black-translucent",
  },
};

// Washi paper canvas / torii vermillion — matches the design tokens in src/app/globals.css and
// the background_color/theme_color in src/app/manifest.ts.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#161412" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoSansJP.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <header
          data-sticky-header
          className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm"
        >
          <div className="h-1 bg-primary" />
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
            <Link href="/" className="inline-flex min-h-11 min-w-11 cursor-pointer items-center text-sm font-semibold tracking-wide transition-opacity hover:opacity-80">
              <span className="text-primary font-jp">聴く</span>{" "}
              <span className="text-muted font-normal">KIKU</span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
