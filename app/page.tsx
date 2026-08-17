import type { Metadata } from "next";
import { headers } from "next/headers";
import { BenchmarkExplorer } from "./benchmark-explorer";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://model-economics.sites.openai.com";

  return {
    title: "LLM Efficiency Frontier — AI benchmark performance vs. cost",
    description:
      "Compare model performance against measured task cost across 14 benchmarks in a focused analytical interface.",
    openGraph: {
      title: "LLM Efficiency Frontier",
      description: "14 benchmarks · 4 sources · performance × cost",
      images: [`${origin}/og-analytical.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "LLM Efficiency Frontier",
      description: "14 benchmarks · 4 sources · performance × cost",
      images: [`${origin}/og-analytical.png`],
    },
  };
}

export default function Home() {
  return <BenchmarkExplorer />;
}
