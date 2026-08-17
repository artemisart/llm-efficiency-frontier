import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LLM Efficiency Frontier",
    template: "%s · LLM Efficiency Frontier",
  },
  description:
    "A benchmark-by-benchmark view of AI model performance against weighted task cost.",
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
