import { Nunito } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${nunito.variable} font-sans antialiased`}
        style={{ fontFamily: "var(--font-nunito), system-ui, sans-serif" }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-md"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
