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

## Refresh benchmark data

With Node.js 22.13+ and internet access, run:

```bash
pnpm refresh:data
pnpm test
```

The refresh command discovers and downloads Artificial Analysis model/endpoint
payloads and the Coding Agent Index, downloads FrontierCode 1.1, DeepSWE 1.1,
and LiveBench 2026-06-25, then runs all build, merge, and model-size enrichment
steps. It validates every chart's score/cost pairs before replacing:

- `app/data/benchmark-data.json` (the site's snapshot)
- `public/data/artificial-analysis-full.json` (downloadable AA source data)
- `scripts/data/artificial-analysis-coding-index.json` (current coding index)

The Coding Agent Index and Intelligence Index versions are read from their
source pages. The other benchmark editions are deliberately pinned: changing
the evaluated task set requires updating the corresponding merge definitions.

If AA stops publishing score/cost pairs for an existing chart, its previous
snapshot is retained, with its original date and a visible historical-data note.
The command prints which charts were retained; it never silently substitutes
old data for a failed download. Use `pnpm refresh:data --strict` to fail instead
if any chart has no current data. Download, parsing, and validation failures leave
the published files untouched.

For inspection or repeatable offline runs:

```bash
pnpm refresh:data --output-dir /tmp/benchmark-preview --save-inputs /tmp/benchmark-inputs
pnpm refresh:data --input-dir /tmp/benchmark-inputs
```

`--output-dir` writes the same directory structure somewhere else. `--input-dir`
replays saved normalized inputs without downloading; it keeps their original
extraction timestamps. Historical fallback comes from the repository's existing
snapshot. `pnpm test:data` runs offline pipeline and failure-handling tests.

DeepSWE's display-time API price adjustments are applied during compilation for
all affected models, using the source's current rate table and each run's token
mix. Saved inputs now also include `deepswe-pricing.json`; older input bundles
must be downloaded again. The compiled data retains original costs and pricing
provenance. LiveBench costs are recalculated from per-task totals to match its
published calculation. Other publishers' costs are not blindly discounted:
see [the complete pricing audit](docs/benchmark-pricing.md) for promotional rates,
source coverage, and historical-pricing limitations.

### Artificial Analysis benchmark versions

The current registry covers all ten Intelligence Index v4.3 components, including
AA-Briefcase, AutomationBench-AA, Terminal-Bench 4.0, GDP.pdf, and AA-LCR v1.1.
The gallery has 18 charts: 15 refreshed charts and three retained historical AA
charts (τ³-Banking, Terminal-Bench v2.1, GPQA Diamond).

Score fields, score scales, source links, and component weights live together in
`scripts/lib/artificial-analysis-benchmarks.mjs`. GDPval and AA-Briefcase use
published Elo scores; AutomationBench uses partial objective completion and
GDP.pdf uses All-pass. Terminal-Bench 4.0 never reuses 2.1 scores or costs.

AA's `weightedCostPerTask` values are contributions to the composite Index.
Compilation divides each by its v4.3 component weight to get the evaluation's
standalone average cost per task; the composite cost is unchanged. Refreshes
validate the source's Index version, published component list, observed cost
slugs, and availability of score/cost pairs for every current evaluation. An
unknown lineup or version fails before replacing data, rather than silently
omitting newly introduced benchmarks.

The low-level `build-benchmark-data.mjs` command now requires the saved
`source-metadata.json` as its fifth argument to identify the cost-weight version.
