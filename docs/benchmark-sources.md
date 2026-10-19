# Benchmark source audit — 2026-10-18

All 30 charts were refreshed from public publisher data. The snapshot contains
855 model records: 418 Artificial Analysis models, 40 coding-agent variants,
136 FrontierCode runs, 70 DeepSWE runs, 70 LiveBench v1 runs, and 48 LiveBench
2.0 runs, plus 73 official Terminal-Bench submissions. Records represent
benchmark-specific models/efforts, not 855 distinct model families. No chart
uses historical fallback. All 30 charts have matching cost/performance data.
AA’s three individual coding-agent component charts are excluded because
their task costs are unavailable.

| Source / edition | Plottable records | Source and findings |
| --- | ---: | --- |
| AA Intelligence Index v4.3.2 and its ten components | 189 per chart | [Models catalog](https://artificialanalysis.ai/models), [Index definition](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index), [methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking). The component weights remain 15/10/5/10/10/10/10/10/15/5%. AA-Briefcase is now v1.1; GDPval-AA is v2.1. |
| AA Coding Agent Index v1.5 | 40 | [Coding agents](https://artificialanalysis.ai/agents/coding-agents). Its current embedded data has 42 variants; 40 have a finite Index score and a positive measured cost. Components remain DeepSWE v1.1, Terminal-Bench 4.0, and SWE-Atlas-QnA. |
| τ³-Banking | 169 | [Standalone evaluation](https://artificialanalysis.ai/evaluations/tau3-banking). Current scores and canonical token/pricing data restore fresh cost pairs; 97 tasks. |
| Terminal-Bench v2.1 | 178 | [Standalone evaluation](https://artificialanalysis.ai/evaluations/terminalbench-2-1). Current scores and standalone token/pricing data; 89 tasks. Kept separate from Terminal-Bench 4.0. |
| GPQA Diamond | 364 | [Standalone evaluation](https://artificialanalysis.ai/evaluations/gpqa-diamond). Current scores and standalone token/pricing data; 198 questions. |
| Terminal-Bench-Science 0.1 — AA | 52 | [AA evaluation](https://artificialanalysis.ai/evaluations/terminal-bench-science). 70 tasks, three repeats using mini-swe-agent; canonical token/rate costs. |
| AA-AnalystAgent | 47 | [AA evaluation](https://artificialanalysis.ai/evaluations/aa-analyst-agent). 80 questions; the headline `analystAgent` field and canonical token/rate costs. |
| Harvey LAB-AA v1.1 | 25 | [AA evaluation](https://artificialanalysis.ai/evaluations/harvey-lab-aa). 120 tasks; Hallucination-Gated All-Pass Rate, separate from v1.0 criterion pass rates. |
| EnterpriseOps-Gym-AA | 47 | [AA evaluation](https://artificialanalysis.ai/evaluations/enterprise-ops-gym-aa). 1,117 stateful enterprise tasks; standalone score and token/rate costs. |
| ITBench-AA | 42 | [AA evaluation](https://artificialanalysis.ai/evaluations/itbench-aa). 59 incidents; precision at full recall. Score field `itbenchSre` differs from token field `itBench`. |
| MLCR-AA | 94 | [AA evaluation](https://artificialanalysis.ai/evaluations/mlcr-aa). 60 questions; overall pass rate. Score field `mlcrOverall` differs from token field `mlcr`. |
| MMMU-Pro | 225 | [AA evaluation](https://artificialanalysis.ai/evaluations/mmmu-pro). 1,730 questions; pass@1. Only matching positive token/rate costs are plotted. |
| FrontierCode 1.1 Main — AA | 40 | [AA evaluation](https://artificialanalysis.ai/evaluations/frontiercode). Independent Stirrup runs, 100 Main tasks, three repeats. Uses `frontierCode`, not Cognition's scores or costs. |
| FrontierCode 1.1 Main | 136 | [Leaderboard/changelog](https://cognition.com/frontiercode), [artifact](https://cognition.com/data/frontiercode-leaderboard/data.json). Current edition remains `v1_1`, Main, quality-adjusted `new_score`, source-reported `cost`. Includes the September/October model additions. |
| DeepSWE v1.1 | 70 | [Leaderboard](https://deepswe.datacurve.ai/), [artifact](https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json), [changelog](https://deepswe.datacurve.ai/changelog). No new leaderboard rows. The source now reports lower costs for all five GPT-6 Astra efforts, with unchanged scores. The current JS module was rechecked; all seven pricing adjustment families remain unchanged. |
| LiveBench v1, 2026-06-25 | 70 | [v1 leaderboard](https://livebench.ai/v1/), [scores](https://livebench.ai/v1/table_2026_06_25.csv), [costs](https://livebench.ai/v1/cost_2026_06_25.csv), [categories](https://livebench.ai/v1/categories_2026_06_25.json). The old root URLs now belong to LiveBench 2.0; v1 artifacts must come from `/v1/`. |
| LiveBench 2.0, 2026-10-14 | 48 | [Leaderboard/methodology](https://livebench.ai/), [scores](https://livebench.ai/table_2026_09_02.csv), [costs](https://livebench.ai/cost_2026_09_02.csv), [suites](https://livebench.ai/categories_2026_09_02.json). The current release label is 2026-10-14; its filenames retain 2026_09_02. Seven suites, with a different task set from v1. |
| Terminal-Bench 4.0 — official | 34 | [Official leaderboard](https://www.tbench.ai/). Public Harbor leaderboard API, package `terminal-bench/terminal-bench`, edition `4-0-0`. Only displayed rows with measured spend and a scored trial count are plotted. |
| Terminal-Bench 2.1 — official | 22 | [Official leaderboard](https://www.tbench.ai/?version=2.1). Package `terminal-bench/terminal-bench-2-1`, edition `main`; separate from AA's model runs. |
| Terminal-Bench-Science 0.1 — official | 17 | [Official leaderboard](https://terminal-bench-science.ai/). Package `terminal-bench-science/terminal-bench-science`, edition `v0-1-eval`; separate from AA's mini-swe-agent runs. |

## Import corrections

Related sources are grouped next to one another while retaining distinct chart
and point identities. AA model runs and official submissions are not pooled
into a shared frontier. The AA Coding Agent Index retains its composite
scores and pooled costs; its individual unpriced component runs are excluded.

Official Terminal-Bench scores use `metrics.accuracy` on its published 0–100
scale. Total spend is divided by the scored attempt count published alongside
the metrics: `metrics.n_trials` for Terminal-Bench and `metrics.tasks` for
Science. Science's 210 attempts are 70 tasks × three repeats; dividing by 70
would inflate its per-attempt cost threefold. Total spend and the divisor are
retained on each point. One 2.1 submission publishes 447 in `metrics.n_trials`
and 445 at the row level; the calculation uses 447 and retains the differing
row count as `reportedRowTrialCount` for inspection.

AA's homepage now publishes reduced model and endpoint records. The complete
catalog (704 models) and endpoints (1,018 records) are discovered on `/models`.
Coding-agent data is read from its own page, including the publisher's new
`agentCreator` and `modelCreators` fields. Index parsing retains the full patch
version `4.3.2`; it must not truncate that version to `4.3`.

The three formerly historical AA charts now use the evaluation pages' shared
manifest, saved as `standaloneEvaluationPayload` alongside the models input and
in the downloadable AA JSON. For each model, compilation mirrors AA's canonical
token counts, API rate cards, cache handling, and per-evaluation fallback shares.
No Intelligence Index weight applies to these standalone evaluations.

The eight added standalone evaluations use the same publisher calculation with
their own task counts and token fields. ITBench and MLCR require explicit token
field aliases rather than reusing their score field names.

For uncached runs, input tokens use the input rate. For cacheable runs, cache
reads are `cacheableInput × cacheHitRate`; AA charges the remaining input at the
cache-write rate. Reasoning and answer tokens use the output rate. Fallback
input, answer, and reasoning costs are blended with their respective published
shares, then total cost is divided by 97, 89, or 198 tasks. Missing rate/token
data remains unavailable. The implementation is in
`scripts/lib/aa-standalone-cost.mjs`.

The publisher implementations inspected were
[AA's cost/cache/fallback module](https://artificialanalysis.ai/_next/static/chunks/20088-a2d770e4ee067027.js),
[AA's evaluation definitions](https://artificialanalysis.ai/_next/static/chunks/66861-a33b3d2083f6b4b0.js),
[DeepSWE's pricing module](https://deepswe.datacurve.ai/assets/index-Dl-MwHZr.js),
and [LiveBench's current display module](https://livebench.ai/static/js/main.38b3cf3c.js).
Source code was inspected as text; downloaded data scripts are not evaluated by
the refresh pipeline.

Both LiveBench editions use the rounded category-average Overall score and
pooled task spend/count, then divide by the success rate. LiveBench 2.0 omits
suites without a score from the Overall mean. Its chart uses separate benchmark
and record identities so scores are never merged with v1's task set.

## Verification

- Strict refresh completed: 30/30 charts; no retained historical points.
- AA agent component charts are excluded from both the gallery and refresh
  output because per-evaluation costs are unavailable. The composite Index
  includes only the 40 variants with positive published costs.
- All 1,890 AA component score/cost pairs matched the publisher's separate
  `intelligenceIndexEvaluations` score and standalone `costPerTask` fields
  within 1e-8. The composite cost is imported unchanged.
- Regression coverage includes all three restored AA charts, cache-write
  billing, fallback-model shares, patch-version rejection, missing LiveBench
  suites, separate LiveBench editions, and output preservation on refresh failure.
- DeepSWE's seven rate-adjustment families were unchanged; retrieval URL, hash,
  and time were updated. All 70 imported pairs matched the current artifact
  and display-pricing policy. GPT-6 Astra max changed from $12.36903240 to
  $7.49782800 in the raw source; no additional discount was applied.

The snapshot's `meta.sources` records the actual download URLs. Publisher
pricing limitations and promotional policies remain documented in
[the pricing audit](benchmark-pricing.md).
