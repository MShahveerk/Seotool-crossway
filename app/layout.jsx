import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

/* Body / UI — neutral, engineered, excellent at small sizes. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/* Headings — geometric, wide, carries the brand signature. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

/* Run ids, costs, ranks, code — anything that must line up in a column. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "Crossway Suite — SEO, SMM & Content Operations",
  description:
    "Agency dashboard for Search Console analytics, PageSpeed, site audits, keyword research, SMM statistics, content approvals, and blog publishing.",
  keywords: "SEO tools, Search Console, PageSpeed, keyword research, SMM, content approvals, marketing dashboard",
  authors: [{ name: "Crossway" }],
  verification: {
    google: "sUHFadG3VzndzY2egA0pPwpKMysL5qSCXuTy3st_pjY",
  },
  openGraph: {
    title: "Crossway Suite — SEO & Marketing Dashboard",
    description: "Professional SEO analytics, social media stats, and content workflow tools.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--cw-overlay)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--cw-neon)] focus:shadow-[var(--cw-shadow-lg)]"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
