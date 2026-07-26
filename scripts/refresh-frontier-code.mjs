import { readFile, writeFile } from "node:fs/promises";

const [datasetPath, frontierCodePath, outputPath] = process.argv.slice(2);

if (!datasetPath || !frontierCodePath || !outputPath) {
  throw new Error(
    "Usage: node scripts/refresh-frontier-code.mjs <benchmark-data.json> <frontier-code.json> <output.json>",
  );
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const frontierCode = JSON.parse(await readFile(frontierCodePath, "utf8")).v1_1;
const benchmarkId = "frontier-code-1-1-main";
const modelPrefix = "frontier-code:";
const previousCount = dataset.models.filter((model) =>
  model.id.startsWith(modelPrefix),
).length;
const baseModels = dataset.models.filter((model) => !model.id.startsWith(modelPrefix));

const frontierModels = [];
for (const [modelName, efforts] of Object.entries(frontierCode.data)) {
  for (const [effort, subsets] of Object.entries(efforts)) {
    const metrics = subsets.main;
    if (
      !metrics ||
      !Number.isFinite(metrics.new_score) ||
      !Number.isFinite(metrics.cost) ||
      metrics.cost <= 0
    ) {
      continue;
    }
    frontierModels.push(
      externalModel({
        id: `${modelPrefix}${slugify(modelName)}:${effort}`,
        baseName: modelName,
        effort: effort === "none" ? null : effort,
        score: metrics.new_score * 100,
        cost: metrics.cost,
        baseModels,
      }),
    );
  }
}

const benchmarkOrder = new Map([
  ["intelligence-index", 0],
  ["aa-coding-agent-index-v1-3", 1],
]);
const benchmarks = dataset.benchmarks
  .map((benchmark) => {
    if (benchmark.id === "intelligence-index") {
      return {
        ...benchmark,
        costNote: "Weighted average cost per Intelligence Index task.",
        costAxisLabel: "Weighted average cost per task (USD)",
      };
    }
    if (benchmark.sourceLabel === "Artificial Analysis") {
      return {
        ...benchmark,
        costNote: benchmark.costNote.replace(/^Weighted cost/, "Average cost"),
        costAxisLabel:
          benchmark.id === "aa-coding-agent-index-v1-3"
            ? benchmark.costAxisLabel
            : "Average cost per task (USD)",
      };
    }
    if (benchmark.id === benchmarkId) {
      return {
        ...benchmark,
        modelsWithData: frontierModels.length,
      };
    }
    return benchmark;
  })
  .sort(
    (left, right) =>
      (benchmarkOrder.get(left.id) ?? 2) - (benchmarkOrder.get(right.id) ?? 2),
  );

const output = {
  ...dataset,
  meta: {
    ...dataset.meta,
    externalModelCount:
      (dataset.meta.externalModelCount ?? 0) - previousCount + frontierModels.length,
  },
  benchmarks,
  models: [...baseModels, ...frontierModels],
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      frontierCodeRecords: frontierModels.length,
      frontierCodeModels: [...new Set(frontierModels.map((model) => model.baseName))],
    },
    null,
    2,
  ),
);

function externalModel({ id, baseName, effort, score, cost, baseModels }) {
  const catalogModel = findCatalogModel(baseModels, baseName, effort);
  const creator = catalogModel?.creator ?? inferCreator(baseName);
  const displayName = effort ? `${baseName} (${effort})` : baseName;
  return {
    id,
    slug: slugify(baseName),
    baseName,
    name: displayName,
    shortName: displayName,
    releaseDate: catalogModel?.releaseDate ?? null,
    deprecated: false,
    reasoning: Boolean(effort) || catalogModel?.reasoning || false,
    openWeights: catalogModel?.openWeights ?? inferOpenWeights(baseName),
    creator,
    benchmarks: {
      [benchmarkId]: {
        score,
        cost,
      },
    },
  };
}

function findCatalogModel(models, baseName, effort) {
  const normalizedBase = normalizeModelName(baseName);
  return models.find((model) => {
    if (!normalizeModelName(model.name).startsWith(normalizedBase)) return false;
    if (!effort) return true;
    return model.name.toLowerCase().includes(effort.toLowerCase());
  });
}

function normalizeModelName(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function inferCreator(value) {
  const normalized = value.toLowerCase();
  const entries = [
    [/claude/, ["anthropic", "Anthropic", "#CC785C"]],
    [/\bgpt\b|gpt-/, ["openai", "OpenAI", "#1f1f1f"]],
    [/deepseek/, ["deepseek", "DeepSeek", "#2243e6"]],
    [/grok/, ["xai", "SpaceXAI", "#736cd3"]],
    [/kimi/, ["kimi", "Kimi", "#047AFE"]],
    [/\bglm\b|glm-/, ["zai", "Z AI", "#1c7ff8"]],
    [/qwen/, ["alibaba", "Alibaba", "#ff7018"]],
    [/minimax/, ["minimax", "MiniMax", "#3b82f6"]],
    [/composer/, ["cursor", "Cursor", "#695af6"]],
    [/\bswe-/, ["cognition", "Cognition", "#04795b"]],
    [/inkling/, ["thinking-machines", "Thinking Machines", "#0a7f7f"]],
  ];
  const match = entries.find(([pattern]) => pattern.test(normalized));
  const [slug, name, color] = match?.[1] ?? ["other", "Other", "#77746c"];
  return {
    id: `external-${slug}`,
    slug,
    name,
    color,
    country: null,
  };
}

function inferOpenWeights(value) {
  return /deepseek|qwen|glm|kimi|minimax/i.test(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
