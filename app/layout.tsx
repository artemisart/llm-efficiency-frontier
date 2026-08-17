import type { Metadata } from "next";
import "./globals.css";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://artemisart.github.io/llm-efficiency-frontier"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LLM Efficiency Frontier — AI benchmark performance vs. cost",
  description:
    "Compare model performance against measured task cost across 14 benchmarks in a focused analytical interface.",
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: `${siteUrl}/favicon.svg`,
  },
  openGraph: {
    title: "LLM Efficiency Frontier",
    description: "14 benchmarks · 4 sources · performance × cost",
    url: siteUrl,
    images: [`${siteUrl}/og-analytical.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "LLM Efficiency Frontier",
    description: "14 benchmarks · 4 sources · performance × cost",
    images: [`${siteUrl}/og-analytical.png`],
  },
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
