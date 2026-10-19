import type { Metadata } from "next";
import benchmarkData from "./data/benchmark-data.json";
import "./globals.css";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://artemisart.github.io/llm-efficiency-frontier"
).replace(/\/$/, "");
const benchmarkCount = benchmarkData.benchmarks.length;
const comparisonDescription = `${benchmarkCount} benchmarks · ${benchmarkData.meta.sourceCount} sources · performance × cost`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LLM Efficiency Frontier — AI benchmark performance vs. cost",
  description:
    `Compare model performance against measured task cost across ${benchmarkCount} benchmarks in a focused analytical interface.`,
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: `${siteUrl}/favicon.svg`,
  },
  openGraph: {
    title: "LLM Efficiency Frontier",
    description: comparisonDescription,
    url: siteUrl,
    images: [`${siteUrl}/og-analytical.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "LLM Efficiency Frontier",
    description: comparisonDescription,
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
