import { readFile, writeFile } from "node:fs/promises";
import { modelCountMeta, plottableModels } from "./lib/benchmark-data.mjs";

const [datasetPath, codingIndexPath, outputPath] = process.argv.slice(2);

if (!datasetPath || !codingIndexPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/merge-coding-index.mjs <benchmark-data.json> <coding-index.json> <output.json>",
  );
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const source = JSON.parse(await readFile(codingIndexPath, "utf8"));
const benchmarkId = "aa-coding-agent-index-v1-3";
const modelPrefix = "coding-index:";
const baseModels = plottableModels(
  dataset.models.filter((model) => !model.id.startsWith(modelPrefix)),
);
const benchmarks = dataset.benchmarks.filter(
  (benchmark) => benchmark.id !== benchmarkId,
);

benchmarks.push({
  id: benchmarkId,
  label: "AA Coding Agent Index v1.3",
  shortLabel: "Coding Agents",
  scoreSuffix: "%",
  description:
    "A composite coding-agent benchmark spanning DeepSWE implementation tasks, Terminal-Bench v2 command-line workflows, and SWE-Atlas-QnA repository understanding. Each component averages pass@1 across three attempts per task, and the index gives all three components equal weight.",
  costNote:
    "Average observed pay-per-token API cost per task, including cached-input discounts and cache-write pricing where Artificial Analysis has that telemetry.",
  costAxisLabel: "Average API cost per task (USD)",
  sourceUrl: source.sourceUrl,
  sourceLabel: "Artificial Analysis",
  modelsWithData: 0,
});

const creatorLookup = new Map();
for (const model of baseModels) {
  creatorLookup.set(model.creator.name.toLowerCase(), model.creator);
  creatorLookup.set(model.creator.slug.toLowerCase(), model.creator);
}

const codingModels = source.rows.map((row) => {
  const displayName = `${row.agentName} · ${row.modelName}`;
  const creator =
    creatorLookup.get(row.modelCreator.toLowerCase()) ??
    creatorLookup.get(row.provider.toLowerCase()) ??
    fallbackCreator(row.modelCreator, row.provider);
  return {
    id: `${modelPrefix}${row.id}`,
    slug: `${slugify(row.agentName)}-${slugify(row.modelName)}`,
    name: displayName,
    shortName: displayName,
    releaseDate: null,
    deprecated: false,
    reasoning: /\((?:minimal|low|medium|high|xhigh|max)\)/i.test(row.modelName),
    openWeights: /deepseek|meta|moonshot|z\.?ai/i.test(
      `${row.modelCreator} ${row.provider}`,
    ),
    creator,
    benchmarks: {
      [benchmarkId]: {
        score: row.indexScore * 100,
        cost: row.costUsdPerTask,
      },
    },
  };
});
const outputModels = plottableModels([...baseModels, ...codingModels]);
benchmarks.at(-1).modelsWithData = outputModels.filter(
  (model) => model.benchmarks[benchmarkId],
).length;

const output = {
  ...dataset,
  meta: {
    ...dataset.meta,
    ...modelCountMeta(dataset.meta, outputModels),
    codingAgentModelCount: codingModels.length,
  },
  benchmarks,
  models: outputModels,
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      benchmarkCount: output.benchmarks.length,
      modelRecords: output.models.length,
      codingAgentRecords: codingModels.length,
    },
    null,
    2,
  ),
);

function fallbackCreator(name, provider) {
  const colors = {
    anthropic: "#cc785c",
    cursor: "#695af6",
    deepseek: "#2243e6",
    google: "#34a853",
    meta: "#0089f4",
    "moonshot ai": "#047afe",
    openai: "#1f1f1f",
    "z.ai": "#1c7ff8",
    spacexai: "#736cd3",
  };
  const slug = slugify(provider || name);
  return {
    id: `external-${slug}`,
    slug,
    name,
    color: colors[name.toLowerCase()] ?? colors[provider.toLowerCase()] ?? "#77746c",
    country: null,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
