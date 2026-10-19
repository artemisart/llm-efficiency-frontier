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
payloads, standalone evaluation token/pricing data, and the Coding Agent Index,
downloads FrontierCode 1.1, DeepSWE 1.1, LiveBench v1 (2026-06-25), and
LiveBench 2.0 (2026-10-14), plus official Terminal-Bench 4.0, 2.1, and
Terminal-Bench-Science 0.1 submissions, then runs all build, merge, and model-size enrichment
steps. It validates every chart's score/cost pairs before replacing:

- `app/data/benchmark-data.json` (the site's snapshot)
- `public/data/artificial-analysis-full.json` (downloadable AA source data)
- `scripts/data/artificial-analysis-coding-index.json` (current coding index)

The Coding Agent Index and Intelligence Index versions are read in full from
their source pages, including patch versions. The other benchmark editions are
deliberately pinned: changing the evaluated task set requires updating the
corresponding merge definitions.

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
mix. Saved inputs include `deepswe-pricing.json`, the standalone AA data within
`models.json`, and three `livebench2-*` files; older input bundles must be
downloaded again. Expanded bundles also require `terminal-bench.json` and the
Coding Agent Index input's per-evaluation scores. The compiled data retains original costs and pricing
provenance. LiveBench costs are recalculated from per-task totals to match its
published calculation. Other publishers' costs are not blindly discounted:
see [the complete pricing audit](docs/benchmark-pricing.md) for promotional rates,
source coverage, and historical-pricing limitations.

### Artificial Analysis benchmark versions

The current registry covers all ten Intelligence Index v4.3.2 components,
including AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA,
Terminal-Bench 4.0, GDP.pdf, and AA-LCR v1.1. The expanded October 18 refresh has
30 current charts and 855 model records, with no historical fallback.

The added AA evaluations are Terminal-Bench-Science 0.1, AA-AnalystAgent,
Harvey LAB-AA v1.1, EnterpriseOps-Gym-AA, ITBench-AA, MLCR-AA, MMMU-Pro, and
AA's independent FrontierCode 1.1 Main runs. Standalone task counts and token
field mappings are in `scripts/lib/aa-standalone-cost.mjs`.

Source variants stay separate and are grouped next to each other in the gallery:
Terminal-Bench 4.0, Terminal-Bench 2.1, and Terminal-Bench-Science 0.1 have AA
model and official runs; FrontierCode has AA and Cognition runs. DeepSWE uses
Datacurve’s published runs.

All 30 charts show cost versus performance. AA’s individual coding-agent
components (DeepSWE, Terminal-Bench 4.0, SWE-Atlas-QnA) are excluded because
separate task costs are unavailable. The composite Coding Agent Index remains
because AA publishes its pooled cost; that cost is never substituted for an
individual evaluation’s spend.

Official Terminal-Bench costs are normalized from total spend to average cost
per scored trial (`total_cost_usd / metrics.n_trials`; Science calls its scored
attempt count `metrics.tasks`). Published trial counts and total spend remain
attached to each point. Submission dates, task versions, and sources are kept
distinct; source-reported costs are not independently repriced.

AA's models page supplies the complete catalog and endpoint payloads; the
homepage's reduced records omit component costs and endpoint identities.
Standalone evaluation payloads now also restore fresh τ³-Banking,
Terminal-Bench v2.1, and GPQA Diamond costs. Their canonical token counts,
cache-hit/cache-write policy, API rate cards, and fallback-model shares are
compiled independently of Index weights. Missing token or pricing data does
not become a fabricated zero-cost point.

LiveBench v1 data moved under `/v1/`. LiveBench 2.0 has its own chart because
it evaluates a different task set. Its publisher labels the release
2026-10-14 while retaining `2026_09_02` artifact filenames. Both editions use
their displayed Overall score and pooled cost per successful task.
See [the current source audit](docs/benchmark-sources.md) for source URLs,
coverage counts, version checks, and pricing verification.

Score fields, score scales, source links, and component weights live together in
`scripts/lib/artificial-analysis-benchmarks.mjs`. GDPval and AA-Briefcase use
published Elo scores; AutomationBench uses partial objective completion and
GDP.pdf uses All-pass. Terminal-Bench 4.0 never reuses 2.1 scores or costs.

AA's `weightedCostPerTask` values are contributions to the composite Index.
Compilation divides each by its v4.3.2 component weight to get the evaluation's
standalone average cost per task; the composite cost is unchanged. Refreshes
validate the source's Index version, published component list, observed cost
slugs, and availability of score/cost pairs for every current evaluation. An
unknown lineup or version fails before replacing data, rather than silently
omitting newly introduced benchmarks.

The low-level `build-benchmark-data.mjs` command now requires the saved
`source-metadata.json` as its fifth argument to identify the cost-weight version.
