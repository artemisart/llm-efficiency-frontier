import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { AA_BENCHMARKS, AA_COMPONENT_WEIGHTS, aaBenchmarkCost, aaScore, validateAaCoverage } from "../scripts/lib/artificial-analysis-benchmarks.mjs";
import { codingIndex, download, manifests, preserveUnavailable, validateDataset } from "../scripts/lib/refresh-sources.mjs";
import { AA_STANDALONE_EVALUATIONS, normalizeStandaloneEvaluations, standaloneAaCost } from "../scripts/lib/aa-standalone-cost.mjs";
import { TERMINAL_BENCH_EDITIONS, terminalBenchmarkPoint, validateTerminalLeaderboard } from "../scripts/lib/terminal-bench.mjs";

const point = { score: 50, cost: 1 };
test("validation rejects non-finite values, empty charts, and duplicate identities", () => {
  const data = { benchmarks: [{ id: "test", modelsWithData: 1 }], models: [{ id: "a", benchmarks: { test: point } }] };
  validateDataset(data);
  for (const invalid of [
    { ...data, models: [...data.models, ...data.models] },
    { ...data, models: [{ id: "a", benchmarks: { test: { score: NaN, cost: 1 } } }] },
    { ...data, benchmarks: [{ id: "empty", modelsWithData: 0 }] },
  ]) assert.throws(() => validateDataset(invalid));
});

test("missing historical charts keep their original freshness date and score/cost pairs", () => {
  const previous = { meta: { extractedAt: "2026-07-26" }, benchmarks: [{ id: "old", modelsWithData: 1 }], models: [{ id: "a", benchmarks: { old: point } }] };
  const data = { benchmarks: [{ id: "old", sourceLabel: "Artificial Analysis", modelsWithData: 0 }], models: [] };
  assert.deepEqual(preserveUnavailable(data, previous, "2026-09-16"), ["old"]);
  assert.equal(data.benchmarks[0].refreshedAt, "2026-07-26");
  assert.equal(data.benchmarks[0].historical, true);
  validateDataset(data);
});

test("benchmarks require finite positive costs, including agent evaluations", () => {
  const data = { benchmarks: [{ id: "agent", modelsWithData: 1 }] };
  for (const cost of [null, 0, -1, NaN, Infinity]) {
    const value = { score: 75, cost, costBasis: "unavailable" };
    assert.throws(() => validateDataset({ ...data, models: [{ id: "a", benchmarks: { agent: value } }] }), /Invalid score\/cost/);
  }
});

test("coding extraction handles split Flight chunks, deduplicates rows and reads version", () => {
  const row = { id: "a", agentName: "Agent", display: { model: 'Model ["x"]', creator: { model: "Lab", agent: "Lab" } }, indexScore: 0.6, mean: { costUsd: 2 }, evals: [{ evaluationDatasetSlug: "Terminal-Bench 4.0", mean: { reward: 0.75 } }] };
  const flight = JSON.stringify({ rows: [row, row] });
  const html = '<script type="application/ld+json">{"@type":"Dataset","name":"Coding Agent Index","description":"Coding Agent Index v1.5"}</script>' +
    [flight.slice(0, 70), flight.slice(70)].map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join("");
  const result = codingIndex(html);
  assert.equal(result.version, "1.5");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].costUsdPerTask, 2);
  assert.equal(result.rows[0].evaluations, undefined, "unpriced component evaluations are excluded");
  assert.deepEqual(result.components, ["Terminal-Bench 4.0"]);
  const current = codingIndex(html, [{ ...row, agentCreator: { name: "Agent Lab" }, modelCreators: [{ name: "Model Lab" }] }]);
  assert.equal(current.rows[0].agentCreator, "Agent Lab");
  assert.equal(current.rows[0].modelCreator, "Model Lab");
  assert.throws(() => codingIndex("<html>Layout changed</html>"));
  assert.deepEqual(manifests("<html>No manifest</html>"), []);
});

test("HTTP errors are surfaced instead of parsed as benchmark data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try { await assert.rejects(download("https://example.test/data"), /HTTP 503/); }
  finally { globalThis.fetch = original; }
});

async function fixture(directory) {
  const model = { id: "aa", slug: "test", name: "Test", shortName: "Test", creator: { id: "lab", name: "Lab", slug: "lab" }, intelligenceIndex: 50, gdpval: 1200, gdpvalNormalized: 0.5, briefcaseBreakdown: { overall: { elo: 1350 } }, automationBenchPartialScore: 0.4, terminalBench40: 0.3, gdpPdfAllPass: 0.2, tauBanking: 0.5, terminalbenchV21: 0.5, scicode: 0.5, hle: 0.5, gpqa: 0.5, critpt: 0.5, omniscience: 50, lcr: 0.5, intelligenceIndexCostPerTask: { cost: { total: 1 }, evaluations: Object.entries(AA_COMPONENT_WEIGHTS).map(([slug, weight]) => ({ slug, weightedCostPerTask: weight * 2 })) } };
  const added = Object.entries(AA_STANDALONE_EVALUATIONS).filter(([slug]) => !["tau3-banking", "terminalbench-2-1", "gpqa-diamond"].includes(slug));
  const standaloneModel = { id: "aa", price1mInputTokens: 2, price1mOutputTokens: 10,
    ...Object.fromEntries(added.map(([, { field }]) => [field, 0.5])),
    canonicalEvalTokenCounts: Object.fromEntries(added.map(([, { field, tokenField }]) => [tokenField ?? field, { input: 1e6, answer: 1e5, reasoning: 2e5, cacheableInput: null }])) };
  const inputs = {
    "models.json": { source: "fixture", extractedAt: "2026-09-16", structuredDatasets: [], payload: { models: [model] }, standaloneEvaluationPayload: normalizeStandaloneEvaluations({ models: [standaloneModel] }) },
    "endpoints.json": { payload: [] },
    "coding-index.json": { sourceUrl: "https://example.test", version: "1.5", components: ["Test"], rows: [1, null].map((costUsdPerTask, index) => ({ id: index ? "unpriced-agent" : "agent", agentName: "Agent", modelName: "Model", modelCreator: "Lab", provider: "lab", indexScore: 0.5, costUsdPerTask,
      evaluations: Object.fromEntries(["aa-agents-deep-swe-v1-1", "aa-agents-terminal-bench-4-0", "aa-agents-swe-atlas-qna"].map((id) => [id, { score: 60, cost: null, costBasis: "unavailable" }])) })) },
    "frontier-code.json": { v1_1: { data: { Test: { high: { main: { new_score: 0.5, cost: 1 } } } } } },
    "deepswe-pricing.json": { benchmarkVersion: "v1.1", adjustments: { "gpt-5-6-luna": { from: { input: 1, cached: 0.1, output: 6 }, to: { input: 0.2, cached: 0.02, output: 1.2 } } } },
    "deepswe.json": { rows: [{ model: "test", reasoning_effort: "high", pass_at_1: 0.5, mean_cost_usd: 1 }] },
    "livebench-table.csv": "model,task\ntest,50\n",
    "livebench-cost.csv": "model,task,nq_task,cost_per_successful_task\ntest,0.5,1,999\n",
    "livebench-categories.json": { reasoning: ["task"] },
    "livebench2-table.csv": "model,reasoning,coding\ntest,80,n/a\n",
    "livebench2-cost.csv": "model,reasoning,nq_reasoning,cost_per_successful_task\ntest,4,2,999\n",
    "livebench2-categories.json": { Reasoning: ["reasoning"], Coding: ["coding"] },
    "terminal-bench.json": { editions: TERMINAL_BENCH_EDITIONS.map((edition) => ({ id: edition.id,
      leaderboard: { package: edition.package, name: edition.name },
      rows: [{ id: "run", status: "display", metadata: { agent_display: { label: "Agent" }, model_display: { label: "Model" }, model_org: { label: "Lab" } },
        metrics: { accuracy: 50, total_cost_usd: edition.tasks * 3 * 2, n_trials: edition.tasks * 3, tasks: edition.tasks * 3 } }] })) },
    "source-metadata.json": { extractedAt: "2026-10-18", intelligenceVersion: "4.3.2" },
  };
  await mkdir(directory, { recursive: true });
  for (const [name, value] of Object.entries(inputs)) await writeFile(join(directory, name), typeof value === "string" ? value : JSON.stringify(value));
}

test("one-command pipeline publishes validated output and leaves it intact on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "refresh-test-"));
  try {
    const input = join(directory, "inputs"), output = join(directory, "output");
    await fixture(input);
    const args = [new URL("../scripts/refresh-benchmarks.mjs", import.meta.url).pathname, "--input-dir", input, "--output-dir", output];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    const target = join(output, "app/data/benchmark-data.json");
    const before = await readFile(target, "utf8");
    const data = JSON.parse(before);
    validateDataset(data);
    assert.equal(data.benchmarks.length, 30);
    assert.equal(data.meta.codingAgentModelCount, 1);
    assert.ok(!data.models.some((model) => model.id === "coding-index:unpriced-agent"));
    assert.equal(data.models.find((model) => model.id === "livebench:test").benchmarks["livebench-2026-06-25"].cost, 1);
    assert.deepEqual(data.models.find((model) => model.id === "livebench:v2:test").benchmarks["livebench-2-0-2026-10-14"], { score: 80, cost: 2.5 });
    assert.equal(data.meta.aaIntelligenceIndexVersion, "4.3.2");
    assert.equal(data.benchmarks.find((benchmark) => benchmark.id === "gdpval-aa-v2-1").label, "GDPval-AA v2.1");
    assert.equal(data.benchmarks[1].id, "aa-coding-agent-index-v1-5");
    assert.deepEqual(data.meta.historicalBenchmarks, ["tau3-banking", "terminal-bench-v2-1", "gpqa-diamond"]);
    assert.deepEqual(data.models.find((model) => model.id === "aa").benchmarks["terminal-bench-4-0"], { score: 30, cost: 2 });
    assert.equal(data.models.find((model) => model.id === "aa").benchmarks["aa-briefcase"].score, 1350);
    for (const id of ["aa-terminal-bench-science-0-1", "aa-analyst-agent", "harvey-lab-aa-v1-1", "enterprise-ops-gym-aa", "itbench-aa", "mlcr-aa", "mmmu-pro", "aa-frontier-code-1-1-main"]) {
      assert.equal(data.models.find((model) => model.id === "aa").benchmarks[id].score, 50, id);
    }
    assert.ok(data.benchmarks.every((benchmark) => !benchmark.id.startsWith("aa-agents-")));
    assert.deepEqual(data.models.find((model) => model.id === "coding-index:agent").benchmarks, { "aa-coding-agent-index-v1-5": { score: 50, cost: 1 } });
    for (const { id } of TERMINAL_BENCH_EDITIONS) assert.equal(data.models.find((model) => model.id === `terminal-bench:${id}:run`).benchmarks[id].cost, 2);
    assert.throws(() => execFileSync(process.execPath, [...args, "--strict"], { stdio: "pipe" }), /No current score\/cost pairs/);
    await writeFile(join(input, "frontier-code.json"), "{}");
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }));
    assert.equal(await readFile(target, "utf8"), before);
    await fixture(input);
    const models = JSON.parse(await readFile(join(input, "models.json"), "utf8"));
    delete models.payload.models[0].automationBenchPartialScore;
    await writeFile(join(input, "models.json"), JSON.stringify(models));
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }), /No plottable AA data for current evaluation automationbench-aa/);
    assert.equal(await readFile(target, "utf8"), before);

    // Standalone evaluation costs restore every legacy chart without using
    // composite weights or retaining stale scores under a fresh date.
    await fixture(input);
    const complete = JSON.parse(await readFile(join(input, "models.json"), "utf8"));
    complete.standaloneEvaluationPayload = normalizeStandaloneEvaluations({ models: [{
      ...complete.standaloneEvaluationPayload.models[0],
      id: "aa", tauBanking: 0.6, terminalBench21: 0.7, gpqa: 0.8,
      price1mInputTokens: 2, price1mOutputTokens: 10,
      canonicalEvalTokenCounts: { ...complete.standaloneEvaluationPayload.models[0].canonicalEvalTokenCounts, ...Object.fromEntries(["tauBanking", "terminalBench21", "gpqa"].map((key) => [key, { input: 1e6, answer: 1e5, reasoning: 2e5, cacheableInput: null }])) },
    }] });
    await writeFile(join(input, "models.json"), JSON.stringify(complete));
    execFileSync(process.execPath, [...args, "--strict"], { stdio: "pipe" });
    const fresh = JSON.parse(await readFile(target, "utf8"));
    assert.deepEqual(fresh.meta.historicalBenchmarks, []);
    const freshModel = fresh.models.find((model) => model.id === "aa");
    assert.deepEqual(freshModel.benchmarks["gpqa-diamond"], { score: 80, cost: 5 / 198 });
    assert.deepEqual(freshModel.benchmarks["terminal-bench-v2-1"], { score: 70, cost: 5 / 89 });
    assert.ok(fresh.benchmarks.every((benchmark) => !benchmark.historical && benchmark.refreshedAt === "2026-10-18"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("DeepSWE reprices all supported models with version-specific, token-weighted rates", async () => {
  const { deepSweCost } = await import("../scripts/lib/deepswe-pricing.mjs");
  const pricing = JSON.parse(await readFile(new URL("../scripts/data/deepswe-pricing.json", import.meta.url), "utf8"));
  const raw = { model: "gpt-5-6-luna", mean_cost_usd: 3.028116810267857, mean_input_tokens: 1000, mean_cache_tokens: 800, mean_output_tokens: 100 };
  const result = deepSweCost(raw, pricing);
  assert.ok(Math.abs(result.cost - 0.6056233620535714) < 1e-12);
  assert.equal(raw.mean_cost_usd, 3.028116810267857);
  assert.deepEqual(deepSweCost(raw, pricing), result, "repeated compilation does not compound the adjustment");
  for (const model of Object.keys(pricing.adjustments)) {
    const row = { ...raw, model, mean_cost_usd: 1 };
    const entry = pricing.adjustments[model];
    const pair = entry.from ? entry : entry["v1.1"];
    const spend = (card) => 200 * card.input + 800 * card.cached + 100 * card.output;
    assert.ok(Math.abs(deepSweCost(row, pricing).cost - spend(pair.to) / spend(pair.from)) < 1e-12, model);
  }
  assert.equal(deepSweCost({ ...raw, model: "unaffected" }, pricing).cost, raw.mean_cost_usd);
  assert.ok(deepSweCost({ ...raw, model: "deepseek-v4-pro" }, pricing).pricingFactor > 1);
  assert.throws(() => deepSweCost({ model: "gpt-5-6-sol", mean_cost_usd: 1 }, pricing), /missing token mix/);
  assert.throws(() => deepSweCost(raw, { ...pricing, benchmarkVersion: "v1" }), /edition/);
});

test("DeepSWE pricing extraction accepts data literals but rejects executable or missing policy", async () => {
  const { extractAdjustments } = await import("../scripts/lib/deepswe-pricing.mjs");
  const source = 'const a={"model":{from:{input:1,cached:.1,output:6},to:{input:.2,cached:.02,output:1.2}}};';
  assert.equal(extractAdjustments(source).model.to.input, 0.2);
  assert.throws(() => extractAdjustments(source.replace('input:.2', 'input:runCode()')));
  assert.throws(() => extractAdjustments('const unrelated = {};'), /found 0/);
  assert.throws(() => extractAdjustments(source.replace('output:1.2', 'output:-1')));
});

test("LiveBench follows task totals instead of a stale precomputed cost summary", async () => {
  const { liveBenchMetrics } = await import("../scripts/lib/livebench-cost.mjs");
  assert.deepEqual(liveBenchMetrics({ a: "50", b: "100" }, { a: "2", nq_a: "2", b: "4", nq_b: "2", cost_per_successful_task: "999" }, { one: ["a"], two: ["b"] }), { score: 75, cost: 2 });
  assert.equal(liveBenchMetrics({ a: "0" }, { a: "1", nq_a: "1" }, { one: ["a"] }).cost, null);
  assert.equal(liveBenchMetrics({ a: "50" }, {}, { one: ["a"] }).cost, null);
  assert.deepEqual(liveBenchMetrics({ a: "80", b: "n/a" }, { a: "4", nq_a: "2" }, { one: ["a"], two: ["b"] }), { score: 80, cost: 2.5 });
  assert.ok(Number.isNaN(liveBenchMetrics({ a: "n/a" }, {}, { one: ["a"] }).score));
});

test("AA standalone costs mirror cache-write billing and per-token fallback shares", () => {
  const model = { id: "test", price1mInputTokens: 2, price1mOutputTokens: 10, cacheHitPrice: 0.2, cacheWritePrice: 2.5, cacheHitRate: 0.75,
    canonicalEvalTokenCounts: { tauBanking: { input: 1e6, cacheableInput: 8e5, answer: 1e5, reasoning: 2e5 }, gpqa: { input: 1e6, cacheableInput: null, answer: 1e5, reasoning: 2e5 } } };
  assert.equal(standaloneAaCost(model, "gpqa-diamond"), 5 / 198);
  assert.ok(Math.abs(standaloneAaCost(model, "tau3-banking") - 4.12 / 97) < 1e-12);
  const fallback = { fallbackPrice: { input: 1, cacheHit: 0.1, cacheWrite: 1.25, output: 5 }, rateByEval: { "tau3-banking": { input: 0.25, output: 0.1, reasoning: 0.5 } } };
  assert.ok(Math.abs(standaloneAaCost(model, "tau3-banking", fallback) - 3.43 / 97) < 1e-12);
  assert.equal(standaloneAaCost({ ...model, cacheHitRate: null }, "tau3-banking"), null);
  assert.equal(standaloneAaCost(model, "terminalbench-2-1"), null);
  assert.throws(() => standaloneAaCost({ ...model, cacheHitRate: 1.1 }, "tau3-banking"), /Invalid AA cache/);
  assert.throws(() => normalizeStandaloneEvaluations({ models: [] }), /Missing AA standalone/);
});

test("AA standalone score fields and token fields stay separate for ITBench and MLCR", () => {
  const tokens = { input: 1e6, answer: 1e5, reasoning: 2e5, cacheableInput: null };
  const source = normalizeStandaloneEvaluations({ models: [{ id: "a", itbenchSre: 0.42, mlcrOverall: 0.25,
    price1mInputTokens: 2, price1mOutputTokens: 10,
    canonicalEvalTokenCounts: { itBench: tokens, mlcr: tokens } }] });
  const model = source.models[0];
  assert.equal(model.itbenchSre, 0.42);
  assert.equal(model.mlcrOverall, 0.25);
  assert.equal(standaloneAaCost(model, "itbench-aa"), 5 / 59);
  assert.equal(standaloneAaCost(model, "mlcr-aa"), 5 / 60);
});

test("official Terminal-Bench costs divide total spend by scored attempts, preserving editions", () => {
  const row = { id: "run", status: "display", n_trials: 99, metrics: { accuracy: 64.8, total_cost_usd: 200, n_trials: 100 } };
  assert.deepEqual(terminalBenchmarkPoint(row), { score: 64.8, cost: 2, rawTotalCost: 200, trialCount: 100, costBasis: "source-total-per-trial", reportedRowTrialCount: 99 });
  assert.equal(terminalBenchmarkPoint({ ...row, status: "pending" }), null);
  assert.equal(terminalBenchmarkPoint({ ...row, metrics: { ...row.metrics, total_cost_usd: null } }), null);
  const science = TERMINAL_BENCH_EDITIONS.find((edition) => edition.id.includes("science"));
  assert.equal(terminalBenchmarkPoint({ ...row, n_trials: 210, metrics: { accuracy: 50, total_cost_usd: 420, tasks: 210 } }, science).cost, 2);
  assert.throws(() => validateTerminalLeaderboard({ leaderboard: { package: "wrong", name: "4-0-0" }, rows: [row] }, TERMINAL_BENCH_EDITIONS[0]), /Unexpected official/);
});

test("AA v4.3.2 uses published score definitions and unweights component costs", () => {
  const model = { intelligenceIndex: 50, gdpval: 1200, gdpvalNormalized: 0.1,
    briefcaseBreakdown: { overall: { elo: 1400 } }, automationBenchPartialScore: 0.6,
    terminalBench40: 0.45, terminalBench21: 0.9, gdpPdfAllPass: 0.25,
    intelligenceIndexCostPerTask: { cost: { total: 1 }, evaluations: Object.entries(AA_COMPONENT_WEIGHTS).map(([slug, weight]) => ({ slug, weightedCostPerTask: weight * 3 })) } };
  for (const [id, expected] of [["aa-briefcase", 1400], ["gdpval-aa-v2-1", 1200], ["automationbench-aa", 60], ["terminal-bench-4-0", 45], ["gdp-pdf", 25]]) {
    const benchmark = AA_BENCHMARKS.find((item) => item.id === id);
    assert.equal(aaScore(model, benchmark) * benchmark.scale, expected);
    assert.ok(Math.abs(aaBenchmarkCost(model, benchmark) - 3) < 1e-12);
  }
  assert.equal(aaBenchmarkCost(model, AA_BENCHMARKS[0]), 1);
  assert.equal(aaBenchmarkCost(model, AA_BENCHMARKS.find((item) => item.id === "terminal-bench-v2-1")), null);
  assert.ok(Math.abs(Object.values(AA_COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  validateAaCoverage([model], { intelligenceVersion: "4.3.2" });
  assert.throws(() => validateAaCoverage([model], { intelligenceVersion: "4.3" }), /Unsupported AA/);
  assert.throws(() => validateAaCoverage([model], { intelligenceVersion: "4.4" }), /Unsupported AA/);
  const changed = structuredClone(model);
  changed.intelligenceIndexCostPerTask.evaluations.push({ slug: "new-evaluation", weightedCostPerTask: 1 });
  assert.throws(() => validateAaCoverage([changed], { intelligenceVersion: "4.3.2" }), /lineup changed/);
});
