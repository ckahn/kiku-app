import type { Metadata } from "next";
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
        <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
            <Link href="/" className="text-sm font-semibold tracking-wide text-ink hover:text-primary transition-colors">
              聴く <span className="text-muted font-normal">KIKU</span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
