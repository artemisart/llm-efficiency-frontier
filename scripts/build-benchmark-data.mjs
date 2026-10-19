import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AA_BENCHMARKS, AA_COMPONENT_WEIGHTS, AA_INDEX_VERSION, aaBenchmarkCost, aaScore, validateAaCoverage } from "./lib/artificial-analysis-benchmarks.mjs";
import { plottableModels } from "./lib/benchmark-data.mjs";
import { AA_STANDALONE_EVALUATIONS, standaloneAaCost } from "./lib/aa-standalone-cost.mjs";

const [mainInput, endpointsInput, appOutput, fullOutput, metadataInput] = process.argv.slice(2);
if (!mainInput || !endpointsInput || !appOutput || !fullOutput) {
  throw new Error(
    "Usage: node scripts/build-benchmark-data.mjs <models.json> <endpoints.json> <app-output.json> <full-output.json> <source-metadata.json>",
  );
}

const main = JSON.parse(await readFile(mainInput, "utf8"));
const endpoints = JSON.parse(await readFile(endpointsInput, "utf8"));
const models = main.payload.models;
const standalone = main.standaloneEvaluationPayload;
const standaloneModels = new Map(standalone?.models.map((model) => [model.id, model]) ?? []);

const benchmarks = AA_BENCHMARKS;
if (!metadataInput) throw new Error("Pass source-metadata.json to identify the AA Index version before converting weighted costs");
validateAaCoverage(models, JSON.parse(await readFile(metadataInput, "utf8")));


const normalizedModels = plottableModels(
  models.map((model) => ({
    id: model.id,
    slug: model.slug,
    name: model.name,
    shortName: model.shortName,
    releaseDate: model.releaseDate,
    deprecated: model.deprecated,
    reasoning: model.isReasoning,
    openWeights: model.isOpenWeights,
    parameters: Number.isFinite(model.parameters) ? model.parameters : null,
    creator: {
      id: model.creator.id,
      slug: model.creator.slug,
      name: model.creator.name,
      color: model.creator.color,
      country: model.creator.country,
    },
    benchmarks: Object.fromEntries(
      benchmarks.flatMap((benchmark) => {
        const standaloneDefinition = AA_STANDALONE_EVALUATIONS[benchmark.costSlug];
        const standaloneModel = standaloneModels.get(model.id);
        const rawScore = standaloneDefinition ? standaloneModel?.[standaloneDefinition.field] : aaScore(model, benchmark);
        const cost = standaloneDefinition ? standaloneAaCost(standaloneModel, benchmark.costSlug, standalone?.priceFallbackByModelId?.[model.id]) : aaBenchmarkCost(model, benchmark);
        if (!Number.isFinite(rawScore) || !Number.isFinite(cost) || cost <= 0) {
          return [];
        }
        return [
          [
            benchmark.id,
            {
              score: rawScore * benchmark.scale,
              cost,
            },
          ],
        ];
      }),
    ),
  })),
);

for (const benchmark of benchmarks.filter((item) => AA_COMPONENT_WEIGHTS[item.costSlug])) {
  if (!normalizedModels.some((model) => model.benchmarks[benchmark.id])) {
    throw new Error(`No plottable AA data for current evaluation ${benchmark.id}; check its score and cost mapping`);
  }
}

const endpointModels = endpoints.payload.map((endpoint) => ({
  id: endpoint.id,
  slug: endpoint.slug,
  modelId: endpoint.modelId,
  modelSlug: endpoint.modelSlug,
  name: endpoint.name,
  shortName: endpoint.shortName,
  host: endpoint.host,
  inputPrice: endpoint.price1mInputTokens,
  outputPrice: endpoint.price1mOutputTokens,
  cacheHitPrice: endpoint.cacheHitPrice,
  blendedPrice: endpoint.price1mBlended0To3To1,
  outputSpeed: endpoint.timescaleData?.medianOutputSpeed ?? null,
  timeToFirstToken: endpoint.timescaleData?.medianTimeToFirstChunk ?? null,
  benchmarks: Object.fromEntries(
    benchmarks.flatMap((benchmark) => {
      const cost = aaBenchmarkCost(endpoint, benchmark);
      return typeof cost === "number" && cost > 0 ? [[benchmark.id, { cost }]] : [];
    }),
  ),
}));

const compact = {
  meta: {
    source: main.source,
    aaIntelligenceIndexVersion: AA_INDEX_VERSION,
    aaComponentWeights: AA_COMPONENT_WEIGHTS,
    extractedAt: main.extractedAt,
    modelCount: normalizedModels.length,
    sourceModelCount: models.length,
    endpointCount: endpointModels.length,
    graphDatasetCount: main.structuredDatasets.length,
    citation: "Artificial Analysis (2025). LLM benchmarks dataset.",
    license: "https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf",
  },
  benchmarks: benchmarks.map((benchmark) => {
    const publishedBenchmark = { ...benchmark };
    delete publishedBenchmark.scoreField;
    delete publishedBenchmark.costSlug;
    delete publishedBenchmark.scale;

    return {
      ...publishedBenchmark,
      modelsWithData: normalizedModels.filter((model) => model.benchmarks[benchmark.id])
        .length,
    };
  }),
  models: normalizedModels,
  endpointModels,
};

const full = {
  meta: compact.meta,
  renderedGraphDatasets: main.structuredDatasets,
  languageModelPayload: main.payload,
  endpointModelPayload: endpoints.payload,
  standaloneEvaluationPayload: standalone,
};

await mkdir(dirname(appOutput), { recursive: true });
await mkdir(dirname(fullOutput), { recursive: true });
await writeFile(appOutput, `${JSON.stringify(compact)}\n`);
await writeFile(fullOutput, `${JSON.stringify(full)}\n`);

console.log(
  JSON.stringify(
    {
      appOutput,
      fullOutput,
      models: normalizedModels.length,
      endpointModels: endpointModels.length,
      plottedByBenchmark: Object.fromEntries(
        compact.benchmarks.map((benchmark) => [benchmark.id, benchmark.modelsWithData]),
      ),
    },
    null,
    2,
  ),
);
