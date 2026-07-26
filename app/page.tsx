import type { Metadata } from "next";
import { headers } from "next/headers";
import { BenchmarkExplorer } from "./benchmark-explorer";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://model-economics.sites.openai.com";

  return {
    title: "Model Economics — AI benchmark performance vs. cost",
    description:
      "Compare model performance against measured task cost across 13 benchmarks from four published sources.",
    openGraph: {
      title: "Model Economics",
      description: "13 benchmarks · 4 sources · performance × cost",
      images: [`${origin}/og.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "Model Economics",
      description: "13 benchmarks · 4 sources · performance × cost",
      images: [`${origin}/og.png`],
    },
  };
}

export default function Home() {
  return <BenchmarkExplorer />;
}
