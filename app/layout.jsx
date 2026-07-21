import { Nunito } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

// Production env validation runs in instrumentation.js (server start).

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata = {
  title: "Crossway SEO Tools - PageSpeed Reports",
  description: "Generate comprehensive PDF reports with Google PageSpeed Insights data. Professional SEO analysis tools for website performance optimization.",
  keywords: "PageSpeed Insights, SEO tools, website performance, PDF reports",
  authors: [{ name: "Crossway SEO Tools" }],
  verification: {
    google: "sUHFadG3VzndzY2egA0pPwpKMysL5qSCXuTy3st_pjY",
  },
  openGraph: {
    title: "Crossway SEO Tools - PageSpeed Reports",
    description: "Generate comprehensive PDF reports with Google PageSpeed Insights data.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${nunito.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

