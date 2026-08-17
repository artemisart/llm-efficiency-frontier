# LLM Efficiency Frontier

An interactive comparison of LLM benchmark performance and measured task cost.
The site is a static Next.js export designed for GitHub Pages.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful Commands

- `pnpm dev`: start local development
- `pnpm build`: create the static site in `out/`
- `pnpm test`: build and verify the exported HTML and benchmark data
- `pnpm lint`: run ESLint

## GitHub Pages

Pushes to `main` deploy through `.github/workflows/deploy-pages.yml`. In the
repository settings, set **Pages → Build and deployment → Source** to
**GitHub Actions**.

The build automatically uses the repository name as its base path. Set
`PAGES_BASE_PATH` to override that behavior, and set `NEXT_PUBLIC_SITE_URL` if
the site moves to a custom domain.
