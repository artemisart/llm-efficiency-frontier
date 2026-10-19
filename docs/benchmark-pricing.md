# Benchmark pricing audit — updated 2026-10-18

The expanded October 18 source check refreshed 30 charts, restored standalone AA
costs for the three previously historical charts, and added eight AA evaluations,
official Terminal-Bench/Science sources, and LiveBench 2.0. All 30 charts have
matching costs; the three individual AA agent components are excluded because
their task costs are unavailable.
See [the source audit](benchmark-sources.md) for current editions, counts, and
verification. DeepSWE's rate adjustments below remain unchanged.

Our charts follow each publisher's cost methodology. They are not a uniform
estimate of what every historical run would cost at today's API prices.
A data refresh updates the source snapshot; it does not guarantee that the
publisher has repriced every historical run.

## DeepSWE: apply the publisher's pricing policy at compilation

[DeepSWE's changelog](https://deepswe.datacurve.ai/changelog) explicitly documents
post-run rate changes. OpenAI's [July 30 announcement](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/)
confirms an 80% Luna cut and a 20% Terra cut. The September 16 DeepSWE client
applies the following rate cards, in USD per million tokens:

| Model | Original input / cached / output | Display input / cached / output |
| --- | --- | --- |
| GPT-5.6 Luna | 1 / 0.1 / 6 | 0.2 / 0.02 / 1.2 |
| GPT-5.6 Terra | 2.5 / 0.25 / 15 | 2 / 0.2 / 12 |
| GPT-5.6 Sol | 5 / 0.5 / 30 | 4 / 0.4 / 20 |
| GLM-5.3 Flash | 0.15 / 0.03 / 0.5 | 0.075 / 0.015 / 0.25 |
| Gemini 3.6 Flash | 1.5 / 0.15 / 7.5 | 0.75 / 0.075 / 3.75 |
| DeepSeek V4 Pro, DeepSWE v1.1 | 0.435 / 0.003625 / 0.87 | 1.32 / 0.044 / 3.96 |
| DeepSeek V4 Flash | 0.14 / 0.0028 / 0.28 | 0.44 / 0.014 / 1.32 |

These are **not all permanent changes**. DeepSWE says Sol's August discount is
promotional through at least November 21, 2026, Gemini's introductory rate runs
through December 31, 2026, and DeepSeek uses peak rather than off-peak rates.
The artifact also contains an older v1-specific DeepSeek Pro adjustment; our
v1.1 compilation must not apply it. This matters because DeepSWE previously
corrected a double-discount bug of its own.

For each affected model and effort, we mirror the source's calculation:

```
spend(rate) = (mean_input_tokens - mean_cache_tokens) * rate.input
            + mean_cache_tokens * rate.cached
            + mean_output_tokens * rate.output
adjusted_cost = raw_mean_cost * spend(new_rate) / spend(old_rate)
```

For uniform rate changes only, the common multiplier can be applied without
token counts. Nonuniform changes require the token mix. Scores never change.
The calculation mirrors the publisher, including its treatment of cache tokens;
it is not an independent billing reconstruction.

`refresh:data` discovers the current public JS module and parses its numeric
rate table without executing JavaScript. It saves the table, source URL, SHA-256,
and retrieval time in `scripts/data/deepswe-pricing.json`, and passes that policy
to the merger. The raw artifact remains unchanged in saved inputs. Compiled
points retain `rawCost`, `pricingFactor`, and `costBasis`. Missing or unrecognized
pricing data fails the refresh before output replacement. Offline replay uses
the saved policy rather than fetching a different policy for old inputs.

Verification: all 21 default visible leaderboard entries matched the compiled
score and cost within the source's displayed rounding. Nineteen effort rows
across seven model families were repriced. Luna max changed from $3.02811681 to
$0.60562336; its score stayed 67.1875%.

## Other sources: avoid a second or unsupported repricing

| Charts covered | Audit finding | Compilation policy |
| --- | --- | --- |
| AA Intelligence Index, GDPval-AA v2, SciCode, Humanity's Last Exam, CritPt, AA-Omniscience, AA-LCR | AA documents current provider rates and token-based costs. Its display reads the supplied cost fields. Luna's payload already lists 0.20 input / 0.02 cached / 1.20 output; Terra and Sol also reflect their revised rates. | Import the supplied costs; no second discount. |
| AA Coding Agent Index v1.5 | The display reads `mean.costUsd`. Methodology describes pooled pay-per-token costs with cached input and cache-write handling. No separate client-side repricing was found. | Preserve AA's supplied cost. Do not apply DeepSWE's adjustments to AA's separate agent runs. |
| τ³-Banking, Terminal-Bench v2.1, GPQA Diamond | The standalone evaluation payload now supplies canonical token counts, rate cards, cache-hit policy, and fallback-model shares. These costs are absent from the current composite Index cost list. | Mirror AA's standalone token-cost calculation and task counts. All three charts now have fresh score/cost pairs; no historical fallback is needed in the October 18 snapshot. |
| FrontierCode 1.1 Main | Its client maps `metrics.cost` directly into both the table and plot. The public JSON exposes aggregate cost and output tokens, but no complete input/cache token mix or rate baseline. | Preserve the publisher's cost. There is no evidence for an additional display adjustment or enough information to establish a safe independent repricing. |
| LiveBench 2026-06-25 | The displayed cost is derived from per-task totals/question counts and the rounded overall score. The exported summary column can differ. Its reference rates include older prices, but actual totals may be recorded cache-aware `cost_usd` or token-derived fallback values. | Recompute cost per successful task exactly as displayed; do not treat reference price columns as proof of the actual billed rate for every run. Flag that this is source-reported pricing, not uniformly repriced to today's API rates. |
| LiveBench 2.0 (2026-10-14) | Seven different suites use the same pooled spend/task-count cost definition. Overall averages suites that have a score. | Keep a separate chart, compute the displayed cost per successful task, and preserve source-reported rates. The public artifact filenames still use 2026_09_02. |
| Eight additional AA standalone evaluations | Each has its own canonical token fields and task count. ITBench and MLCR use token-field aliases different from their score fields. | Apply AA's standalone token/rate/cache/fallback calculation, independently of Index component weights. |
| AA agent DeepSWE, Terminal-Bench 4.0, SWE-Atlas-QnA | Public per-evaluation records contain scores and token totals, but omit evaluation-level spend and cache/rate detail. The Index's pooled cost is for a different task mix. | Exclude these individual component charts. Never apply the pooled Index cost to an individual evaluation, or infer spend from incomplete token totals. |
| Official Terminal-Bench 4.0, 2.1, Science 0.1 | Public leaderboard records expose total cost and scored attempt counts. Science calls its repeated-attempt count `tasks`. | Plot `total_cost_usd / metrics.n_trials` (Science: `/ metrics.tasks`) and retain the total/divisor. Keep AA and official submissions separate; do not independently reprice historical submissions. |

LiveBench's [repository documentation](https://github.com/LiveBench/new-livebench/blob/main/README.md)
explicitly calls the model-level token and price fields tooltip/reference data.
The public export does not expose the per-answer uncached/cached tokens and
billing baseline needed to reprice mixed historical runs without assumptions.
The missing information also prevents verifying that FrontierCode's aggregate
costs all use today's prices. These are audit limitations, not zero-cost data
or permission to apply DeepSWE's multiplier across unrelated benchmarks.

LiveBench's default Overall calculation is:

```
overall_score = round(mean(category-average scores), 2)
cost_per_question = sum(task total costs) / sum(task question counts)
cost_per_successful_task = cost_per_question / overall_score * 100
```

## Sources inspected

- [DeepSWE changelog](https://deepswe.datacurve.ai/changelog), [raw v1.1 artifact](https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json), and [pricing implementation at audit time](https://deepswe.datacurve.ai/assets/index-C8-z8dCr.js).
- [AA methodology and pricing definitions](https://artificialanalysis.ai/methodology) and [Coding Agent Index methodology](https://artificialanalysis.ai/methodology/coding-agents-benchmarking), plus the homepage/coding-agent payloads and their display modules.
- [FrontierCode](https://cognition.com/frontiercode), its [data artifact](https://cognition.com/data/frontiercode-leaderboard/data.json), and its leaderboard component.
- [LiveBench source documentation](https://github.com/LiveBench/new-livebench/blob/main/README.md), [cost CSV](https://livebench.ai/cost_2026_06_25.csv), and [display implementation at audit time](https://livebench.ai/static/js/main.ac6b12ef.js).

## Follow-up: AA Index v4.3 coverage and cost-weight correction

This section describes the September correction. The October snapshot uses
Index v4.3.2, AA-Briefcase v1.1, and GDPval-AA v2.1 with the same ten weights.
The standalone-cost restoration above supersedes the historical-data limitation
described at the end of this section.

The gallery now includes all ten current Index components. AA-Briefcase,
AutomationBench-AA, Terminal-Bench 4.0, and GDP.pdf were added; AA-LCR is labeled
v1.1. GDPval now uses AA's public Elo rather than its normalized Index component.

The earlier importer mislabeled `weightedCostPerTask` as a standalone evaluation
cost. AA's implementation multiplies each evaluation's average task cost by its
Index weight. We now undo that weighting for individual charts. The composite
Index's total stays unchanged. We compared 20 published cost-chart records for
each of the four new evaluations (80 comparisons); all matched the corrected
calculation. This is a cost-definition correction, not an API price adjustment.

The versioned weights and mappings are in
`scripts/lib/artificial-analysis-benchmarks.mjs`. Registry validation prevents a
future Index revision from silently applying old weights or omitting new tasks.
Historical charts remain explicitly dated snapshots; this correction does not
rewrite their historical values under the new v4.3 methodology.

Sources: [AA Index v4.3](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index),
[AA-Briefcase](https://artificialanalysis.ai/evaluations/aa-briefcase),
[AutomationBench-AA](https://artificialanalysis.ai/evaluations/automationbench-aa),
[Terminal-Bench 4.0](https://artificialanalysis.ai/evaluations/terminalbench-4-0),
and [GDP.pdf](https://artificialanalysis.ai/evaluations/gdp-pdf).
