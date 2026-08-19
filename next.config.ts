import type { NextConfig } from "next"

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? ""
const isUserOrOrganizationPage = repositoryName.endsWith(".github.io")
const inferredPagesBasePath =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName &&
  !isUserOrOrganizationPage
    ? `/${repositoryName}`
    : ""
const basePath = process.env.PAGES_BASE_PATH ?? inferredPagesBasePath

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  allowedDevOrigins: ["**.ts.net"],
}

export default nextConfig
