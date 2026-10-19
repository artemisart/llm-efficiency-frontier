import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { download, manifests, decodePayload, structuredDatasets, codingIndex, validateDataset, preserveUnavailable } from "./lib/refresh-sources.mjs";
import { downloadDeepSwePricing } from "./lib/deepswe-pricing.mjs";
import { groupBenchmarkSources, modelCountMeta } from "./lib/benchmark-data.mjs";
import { normalizeStandaloneEvaluations } from "./lib/aa-standalone-cost.mjs";
import { downloadTerminalBench, TERMINAL_BENCH_API, TERMINAL_BENCH_EDITIONS } from "./lib/terminal-bench.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: {
  "output-dir": { type: "string", default: root },
  "input-dir": { type: "string" },
  "save-inputs": { type: "string" },
  "strict": { type: "boolean", default: false },
  "help": { type: "boolean", default: false },
} });
if (values.help) {
  console.log("Usage: pnpm refresh:data [--output-dir DIR] [--save-inputs DIR] [--input-dir DIR] [--strict]\nDownloads all sources, builds and validates before replacing output files.\n--input-dir replays saved normalized inputs without network access.\n--strict rejects historical benchmarks missing from the current source.");
  process.exit(0);
}
const output = resolve(values["output-dir"]);
const stage = await mkdtemp(join(tmpdir(), "benchmark-refresh-"));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (name, value) => writeFile(join(stage, name), typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
const run = (script, ...args) => {
  execFileSync(process.execPath, [join(root, "scripts", script), ...args.map((name) => join(stage, name))], { stdio: "pipe" });
};
const inputNames = ["models.json", "endpoints.json", "coding-index.json", "frontier-code.json", "deepswe.json", "deepswe-pricing.json", "livebench-table.csv", "livebench-cost.csv", "livebench-categories.json", "livebench2-table.csv", "livebench2-cost.csv", "livebench2-categories.json", "terminal-bench.json", "source-metadata.json"];
try {
  if (values["input-dir"]) {
    for (const name of inputNames) await writeFile(join(stage, name), await readFile(join(resolve(values["input-dir"]), name)));
  } else {
    console.log("Downloading Artificial Analysis, Coding Agent Index, FrontierCode, DeepSWE, and LiveBench…");
    // The homepage now publishes reduced payloads without component costs or
    // endpoint identities. The models page retains both complete datasets.
    const aaUrl = "https://artificialanalysis.ai/models";
    const html = (await download(aaUrl)).toString();
    const extractedAt = new Date().toISOString();
    let foundModels = false, foundEndpoints = false;
    for (const manifest of manifests(html)) {
      const payload = decodePayload(await download(new URL(manifest.path, aaUrl)), manifest.key);
      const record = { source: aaUrl, extractedAt, manifestPath: manifest.path, structuredDatasets: structuredDatasets(html), payload };
      if (Array.isArray(payload.models) && payload.models.some((model) => model.intelligenceIndexCostPerTask?.evaluations?.length)) { await save("models.json", record); foundModels = true; }
      if (Array.isArray(payload) && payload.length && payload.every((row) => row.modelId)) { await save("endpoints.json", record); foundEndpoints = true; }
    }
    if (!foundModels || !foundEndpoints) throw new Error("Could not discover both Artificial Analysis payloads");
    const codingHtml = (await download("https://artificialanalysis.ai/agents/coding-agents")).toString();
    // Coding-agent records are independent of the models catalog. Read their
    // complete manifest on the coding page rather than a homepage projection.
    let codingRows;
    for (const manifest of manifests(codingHtml)) {
      const payload = decodePayload(await download(new URL(manifest.path, aaUrl)), manifest.key);
      if (Array.isArray(payload.codingAgents) && payload.codingAgents.length) codingRows = payload.codingAgents;
    }
    await save("coding-index.json", codingIndex(codingHtml, codingRows));
    const indexUrl = "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index";
    const indexHtml = (await download(indexUrl)).toString();
    const intelligenceVersion = indexHtml.match(/Intelligence Index v(\d+(?:\.\d+)+)/)?.[1];
    const componentParagraph = indexHtml.match(/combines performance across[^<]*[\s\S]*?<\/p>/)?.[0];
    const intelligenceComponents = [...new Set([...((componentParagraph ?? "").matchAll(/href="\/evaluations\/([^"/]+)"/g))].map((match) => match[1]))];
    if (!intelligenceComponents.length) throw new Error("Cannot identify the AA Index component list");
    if (!intelligenceVersion) throw new Error("Cannot identify Intelligence Index version");
    let standaloneEvaluationPayload;
    for (const manifest of manifests(indexHtml)) {
      const payload = decodePayload(await download(new URL(manifest.path, aaUrl)), manifest.key);
      if (payload.models?.some((model) => model.canonicalEvalTokenCounts)) standaloneEvaluationPayload = normalizeStandaloneEvaluations(payload);
    }
    if (!standaloneEvaluationPayload) throw new Error("Cannot discover AA standalone evaluation costs");
    const main = await json(join(stage, "models.json"));
    await save("models.json", { ...main, standaloneEvaluationPayload: { source: indexUrl, ...standaloneEvaluationPayload } });
    await save("deepswe-pricing.json", await downloadDeepSwePricing());
    await save("terminal-bench.json", await downloadTerminalBench());
    const sources = {
      "frontier-code.json": "https://cognition.com/data/frontiercode-leaderboard/data.json",
      "deepswe.json": "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
      "livebench-table.csv": "https://livebench.ai/v1/table_2026_06_25.csv",
      "livebench-cost.csv": "https://livebench.ai/v1/cost_2026_06_25.csv",
      "livebench-categories.json": "https://livebench.ai/v1/categories_2026_06_25.json",
      // LiveBench labels this release 2026-10-14, but retains 2026_09_02
      // filenames. Keep its long-horizon task set separate from LiveBench v1.
      "livebench2-table.csv": "https://livebench.ai/table_2026_09_02.csv",
      "livebench2-cost.csv": "https://livebench.ai/cost_2026_09_02.csv",
      "livebench2-categories.json": "https://livebench.ai/categories_2026_09_02.json",
    };
    const results = await Promise.allSettled(Object.entries(sources).map(async ([name, url]) => save(name, (await download(url)).toString())));
    for (const result of results) if (result.status === "rejected") throw result.reason;
    await save("source-metadata.json", { extractedAt, intelligenceVersion, intelligenceComponents, sources: {
      "artificial-analysis-models": aaUrl,
      "artificial-analysis-evaluations": indexUrl,
      "artificial-analysis-coding-agents": "https://artificialanalysis.ai/agents/coding-agents",
      "terminal-bench": { apiUrl: TERMINAL_BENCH_API, editions: TERMINAL_BENCH_EDITIONS.map(({ id, package: packageName, name, dataUrl }) => ({ id, package: packageName, name, dataUrl })) },
      ...sources,
    } });
  }
  if (values["save-inputs"]) {
    const directory = resolve(values["save-inputs"]);
    await mkdir(directory, { recursive: true });
    for (const name of inputNames) await writeFile(join(directory, name), await readFile(join(stage, name)));
  }
  const sourceMeta = await json(join(stage, "source-metadata.json"));
  const coding = await json(join(stage, "coding-index.json"));
  // Older saved inputs include unpriced component evaluations, which are no
  // longer published as benchmarks. Retain only the composite Index records.
  for (const row of coding.rows) delete row.evaluations;
  await save("coding-index.json", coding);
  run("build-benchmark-data.mjs", "models.json", "endpoints.json", "base.json", "full.json", "source-metadata.json");
  run("merge-external-benchmarks.mjs", "base.json", "frontier-code.json", "deepswe.json", "livebench-table.csv", "livebench-cost.csv", "livebench-categories.json", "external.json", "deepswe-pricing.json", "livebench2-table.csv", "livebench2-cost.csv", "livebench2-categories.json");
  run("merge-coding-index.mjs", "external.json", "coding-index.json", "coding.json");
  run("merge-terminal-bench.mjs", "coding.json", "terminal-bench.json", "terminal.json");
  run("refresh-frontier-code.mjs", "terminal.json", "frontier-code.json", "frontier.json");
  run("enrich-model-sizes.mjs", "frontier.json", "full.json", "final.json");
  const data = await json(join(stage, "final.json"));
  data.benchmarks = groupBenchmarkSources(data.benchmarks);
  const full = await json(join(stage, "full.json"));
  full.codingAgentIndex = coding;
  full.meta.sources = sourceMeta.sources;
  await save("full.json", full);
  data.benchmarks.find((item) => item.id === "intelligence-index").description = `Artificial Analysis Intelligence Index v${sourceMeta.intelligenceVersion}, a weighted composite of ${sourceMeta.intelligenceComponents?.length ?? 10} independently run evaluations.`;
  const previous = await json(join(root, "app/data/benchmark-data.json"));
  const missing = data.benchmarks.filter((item) => !item.modelsWithData).map((item) => item.id);
  if (values.strict && missing.length) throw new Error(`No current score/cost pairs: ${missing.join(", ")}`);
  const historical = preserveUnavailable(data, previous, sourceMeta.extractedAt);
  data.meta = { ...data.meta, ...modelCountMeta(data.meta, data.models), refreshedAt: sourceMeta.extractedAt, sources: sourceMeta.sources, historicalBenchmarks: historical };
  validateDataset(data);
  await save("final.json", data);
  const files = [["deepswe-pricing.json", "scripts/data/deepswe-pricing.json"], ["full.json", "public/data/artificial-analysis-full.json"], ["coding-index.json", "scripts/data/artificial-analysis-coding-index.json"], ["final.json", "app/data/benchmark-data.json"]];
  // No published file is touched until all downloads, transformations and validation succeed.
  for (const [name, destination] of files) {
    const target = join(output, destination);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    try { await writeFile(temporary, await readFile(join(stage, name))); await rename(temporary, target); }
    finally { await rm(temporary, { force: true }); }
  }
  for (const id of historical) console.warn(`Historical data retained: ${id} (current source has no score/cost pairs)`);
  console.log(`Refreshed ${data.benchmarks.length - historical.length}/${data.benchmarks.length} benchmarks; ${data.models.length} model records. Output: ${output}`);
} catch (error) {
  console.error(`Benchmark refresh failed: ${error.message}`);
  if (error.stderr) console.error(error.stderr.toString());
  process.exitCode = 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
