import { readFile, writeFile } from "node:fs/promises";
import { modelCountMeta, plottableModels } from "./lib/benchmark-data.mjs";
import { TERMINAL_BENCH_EDITIONS, terminalBenchmarkPoint, validateTerminalLeaderboard } from "./lib/terminal-bench.mjs";

const [inputPath, sourcePath, outputPath] = process.argv.slice(2);
if (!inputPath || !sourcePath || !outputPath) throw new Error("Usage: node scripts/merge-terminal-bench.mjs <dataset.json> <terminal-bench.json> <output.json>");
const data = JSON.parse(await readFile(inputPath, "utf8"));
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const models = data.models.filter((model) => !model.id.startsWith("terminal-bench:"));
const benchmarks = data.benchmarks.filter((benchmark) => !TERMINAL_BENCH_EDITIONS.some(({ id }) => id === benchmark.id));
const catalog = new Map(models.map((model) => [model.creator.name.toLowerCase(), model.creator]));
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const edition of TERMINAL_BENCH_EDITIONS) {
  const payload = source.editions.find(({ id }) => id === edition.id);
  if (!payload) throw new Error(`Missing official Terminal-Bench source: ${edition.id}`);
  validateTerminalLeaderboard(payload, edition);
  let count = 0;
  for (const row of payload.rows) {
    const point = terminalBenchmarkPoint(row, edition);
    if (!point) continue;
    const metadata = row.metadata;
    const agent = metadata?.agent_display?.label;
    const model = metadata?.model_display?.label;
    const lab = metadata?.model_org?.label;
    if (!row.id || !agent || !model || !lab) throw new Error(`Missing Terminal-Bench identity: ${row.id}`);
    const effort = metadata.reasoning_effort;
    const name = `${agent} · ${model}${effort && effort !== "none" ? ` (${effort})` : ""}`;
    const creator = catalog.get(lab.toLowerCase()) ?? { id: `external-${slug(lab)}`, slug: slug(lab), name: lab, color: "#77746c", country: null };
    models.push({ id: `terminal-bench:${edition.id}:${row.id}`, slug: slug(model), name, shortName: name,
      releaseDate: metadata.release_date ?? metadata.model_release_date ?? null, deprecated: false, reasoning: Boolean(effort && effort !== "none"),
      openWeights: /qwen|deepseek|glm|kimi|nemotron|mistral|step|gemma|muse.*open/i.test(model), parameters: null, creator,
      agentName: agent, runDate: metadata.date, benchmarks: { [edition.id]: point } });
    count++;
  }
  if (!count) throw new Error(`No official Terminal-Bench score/cost pairs: ${edition.id}`);
  benchmarks.push({ id: edition.id, label: edition.label, shortLabel: edition.shortLabel, scoreSuffix: "%",
    description: `Official submissions on the ${edition.tasks}-task ${edition.label.replace(" — official", "")} benchmark. Each row identifies the submitted agent, model, and reasoning settings. These runs are independent of AA’s evaluations.`,
    pricingNote: "Source-reported total spend divided by the number of scored trials. Historical submissions are not independently repriced to current API rates.",
    costNote: "Official total_cost_usd ÷ n_trials; average cost per scored task attempt.", costAxisLabel: "Average cost per task attempt (USD)",
    sourceUrl: edition.sourceUrl, sourceLabel: "Terminal-Bench", modelsWithData: count });
}
const outputModels = plottableModels(models);
await writeFile(outputPath, JSON.stringify({ ...data, benchmarks, models: outputModels, meta: { ...data.meta, ...modelCountMeta(data.meta, outputModels), sourceCount: 5 } }) + "\n");
