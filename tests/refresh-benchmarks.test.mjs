import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { AA_BENCHMARKS, AA_COMPONENT_WEIGHTS, aaBenchmarkCost, aaScore, validateAaCoverage } from "../scripts/lib/artificial-analysis-benchmarks.mjs";
import { codingIndex, download, manifests, preserveUnavailable, validateDataset } from "../scripts/lib/refresh-sources.mjs";

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

test("coding extraction handles split Flight chunks, deduplicates rows and reads version", () => {
  const row = { id: "a", agentName: "Agent", display: { model: 'Model ["x"]', creator: { model: "Lab", agent: "Lab" } }, indexScore: 0.6, mean: { costUsd: 2 }, evals: [{ evaluationDatasetSlug: "Terminal-Bench 4.0" }] };
  const flight = JSON.stringify({ rows: [row, row] });
  const html = '<script type="application/ld+json">{"@type":"Dataset","name":"Coding Agent Index","description":"Coding Agent Index v1.5"}</script>' +
    [flight.slice(0, 70), flight.slice(70)].map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join("");
  const result = codingIndex(html);
  assert.equal(result.version, "1.5");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].costUsdPerTask, 2);
  assert.deepEqual(result.components, ["Terminal-Bench 4.0"]);
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
  const inputs = {
    "models.json": { source: "fixture", extractedAt: "2026-09-16", structuredDatasets: [], payload: { models: [model] } },
    "endpoints.json": { payload: [] },
    "coding-index.json": { sourceUrl: "https://example.test", version: "1.5", components: ["Test"], rows: [{ id: "agent", agentName: "Agent", modelName: "Model", modelCreator: "Lab", provider: "lab", indexScore: 0.5, costUsdPerTask: 1 }] },
    "frontier-code.json": { v1_1: { data: { Test: { high: { main: { new_score: 0.5, cost: 1 } } } } } },
    "deepswe-pricing.json": { benchmarkVersion: "v1.1", adjustments: { "gpt-5-6-luna": { from: { input: 1, cached: 0.1, output: 6 }, to: { input: 0.2, cached: 0.02, output: 1.2 } } } },
    "deepswe.json": { rows: [{ model: "test", reasoning_effort: "high", pass_at_1: 0.5, mean_cost_usd: 1 }] },
    "livebench-table.csv": "model,task\ntest,50\n",
    "livebench-cost.csv": "model,task,nq_task,cost_per_successful_task\ntest,0.5,1,999\n",
    "livebench-categories.json": { reasoning: ["task"] },
    "source-metadata.json": { extractedAt: "2026-09-16", intelligenceVersion: "4.3" },
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
    assert.equal(data.benchmarks.length, 18);
    assert.equal(data.models.find((model) => model.id === "livebench:test").benchmarks["livebench-2026-06-25"].cost, 1);
    assert.equal(data.benchmarks[1].id, "aa-coding-agent-index-v1-5");
    assert.deepEqual(data.meta.historicalBenchmarks, ["tau3-banking", "terminal-bench-v2-1", "gpqa-diamond"]);
    assert.deepEqual(data.models.find((model) => model.id === "aa").benchmarks["terminal-bench-4-0"], { score: 30, cost: 2 });
    assert.equal(data.models.find((model) => model.id === "aa").benchmarks["aa-briefcase"].score, 1350);
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
});

test("AA v4.3 uses published score definitions and unweights component costs", () => {
  const model = { intelligenceIndex: 50, gdpval: 1200, gdpvalNormalized: 0.1,
    briefcaseBreakdown: { overall: { elo: 1400 } }, automationBenchPartialScore: 0.6,
    terminalBench40: 0.45, terminalBench21: 0.9, gdpPdfAllPass: 0.25,
    intelligenceIndexCostPerTask: { cost: { total: 1 }, evaluations: Object.entries(AA_COMPONENT_WEIGHTS).map(([slug, weight]) => ({ slug, weightedCostPerTask: weight * 3 })) } };
  for (const [id, expected] of [["aa-briefcase", 1400], ["gdpval-aa-v2", 1200], ["automationbench-aa", 60], ["terminal-bench-4-0", 45], ["gdp-pdf", 25]]) {
    const benchmark = AA_BENCHMARKS.find((item) => item.id === id);
    assert.equal(aaScore(model, benchmark) * benchmark.scale, expected);
    assert.ok(Math.abs(aaBenchmarkCost(model, benchmark) - 3) < 1e-12);
  }
  assert.equal(aaBenchmarkCost(model, AA_BENCHMARKS[0]), 1);
  assert.equal(aaBenchmarkCost(model, AA_BENCHMARKS.find((item) => item.id === "terminal-bench-v2-1")), null);
  assert.ok(Math.abs(Object.values(AA_COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  validateAaCoverage([model], { intelligenceVersion: "4.3" });
  assert.throws(() => validateAaCoverage([model], { intelligenceVersion: "4.4" }), /Unsupported AA/);
  const changed = structuredClone(model);
  changed.intelligenceIndexCostPerTask.evaluations.push({ slug: "new-evaluation", weightedCostPerTask: 1 });
  assert.throws(() => validateAaCoverage([changed], { intelligenceVersion: "4.3" }), /lineup changed/);
});
