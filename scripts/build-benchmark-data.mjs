import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [mainInput, endpointsInput, appOutput, fullOutput] = process.argv.slice(2);
if (!mainInput || !endpointsInput || !appOutput || !fullOutput) {
  throw new Error(
    "Usage: node scripts/build-benchmark-data.mjs <models.json> <endpoints.json> <app-output.json> <full-output.json>",
  );
}

const main = JSON.parse(await readFile(mainInput, "utf8"));
const endpoints = JSON.parse(await readFile(endpointsInput, "utf8"));
const models = main.payload.models;

const benchmarks = [
  {
    id: "intelligence-index",
    label: "Intelligence Index",
    shortLabel: "Index",
    scoreField: "intelligenceIndex",
    costSlug: null,
    scale: 1,
    scoreSuffix: "",
    description:
      "Artificial Analysis Intelligence Index v4.1, combining nine independently run evaluations.",
    costNote: "Weighted average cost per Intelligence Index task.",
  },
  {
    id: "gdpval-aa-v2",
    label: "GDPval-AA v2",
    shortLabel: "GDPval",
    scoreField: "gdpvalNormalized",
    costSlug: "gdpval-aa",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Professional-task performance, normalized by Artificial Analysis for the Intelligence Index.",
    costNote: "Weighted cost per GDPval-AA task.",
  },
  {
    id: "tau3-banking",
    label: "τ³-Banking",
    shortLabel: "τ³ Banking",
    scoreField: "tauBanking",
    costSlug: "tau3-banking",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Agentic banking benchmark measuring successful completion of multi-step service tasks.",
    costNote: "Weighted cost per τ³-Banking task.",
  },
  {
    id: "terminal-bench-v2-1",
    label: "Terminal-Bench v2.1",
    shortLabel: "Terminal",
    scoreField: "terminalbenchV21",
    costSlug: "terminalbench-v2-1",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Capability on realistic terminal-based tasks that require planning, tools, and execution.",
    costNote: "Weighted cost per Terminal-Bench v2.1 task.",
  },
  {
    id: "scicode",
    label: "SciCode",
    shortLabel: "SciCode",
    scoreField: "scicode",
    costSlug: "scicode",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Scientific coding performance on problems requiring domain reasoning and implementation.",
    costNote: "Weighted cost per SciCode task.",
  },
  {
    id: "humanitys-last-exam",
    label: "Humanity’s Last Exam",
    shortLabel: "HLE",
    scoreField: "hle",
    costSlug: "humanitys-last-exam",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Broad expert-level academic questions designed to resist simple benchmark saturation.",
    costNote: "Weighted cost per Humanity’s Last Exam task.",
  },
  {
    id: "gpqa-diamond",
    label: "GPQA Diamond",
    shortLabel: "GPQA",
    scoreField: "gpqa",
    costSlug: "gpqa-diamond",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Graduate-level, expert-written science questions where strong reasoning matters.",
    costNote: "Weighted cost per GPQA Diamond task.",
  },
  {
    id: "critpt",
    label: "CritPt",
    shortLabel: "CritPt",
    scoreField: "critpt",
    costSlug: "critpt",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Critical reasoning evaluation included in Artificial Analysis Intelligence Index v4.1.",
    costNote: "Weighted cost per CritPt task.",
  },
  {
    id: "aa-omniscience",
    label: "AA-Omniscience",
    shortLabel: "Omniscience",
    scoreField: "omniscience",
    costSlug: "omniscience",
    scale: 1,
    scoreSuffix: "",
    description:
      "Artificial Analysis index balancing accurate knowledge against confident hallucination.",
    costNote: "Weighted cost per AA-Omniscience task.",
  },
  {
    id: "aa-lcr",
    label: "AA-LCR",
    shortLabel: "AA-LCR",
    scoreField: "lcr",
    costSlug: "artificial-analysis-long-context-reasoning",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Artificial Analysis Long Context Reasoning benchmark for retrieving and using distant context.",
    costNote: "Weighted cost per AA-LCR task.",
  },
];

function benchmarkCost(model, benchmark) {
  if (!model.intelligenceIndexCostPerTask) return null;
  if (!benchmark.costSlug) {
    return model.intelligenceIndexCostPerTask.cost?.total ?? null;
  }
  return (
    model.intelligenceIndexCostPerTask.evaluations?.find(
      (evaluation) => evaluation.slug === benchmark.costSlug,
    )?.weightedCostPerTask ?? null
  );
}

const normalizedModels = models.map((model) => ({
  id: model.id,
  slug: model.slug,
  name: model.name,
  shortName: model.shortName,
  releaseDate: model.releaseDate,
  deprecated: model.deprecated,
  reasoning: model.isReasoning,
  openWeights: model.isOpenWeights,
  creator: {
    id: model.creator.id,
    slug: model.creator.slug,
    name: model.creator.name,
    color: model.creator.color,
    country: model.creator.country,
  },
  benchmarks: Object.fromEntries(
    benchmarks.flatMap((benchmark) => {
      const rawScore = model[benchmark.scoreField];
      const cost = benchmarkCost(model, benchmark);
      if (typeof rawScore !== "number" || typeof cost !== "number" || cost <= 0) return [];
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
}));

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
      const cost = benchmarkCost(endpoint, benchmark);
      return typeof cost === "number" && cost > 0 ? [[benchmark.id, { cost }]] : [];
    }),
  ),
}));

const compact = {
  meta: {
    source: main.source,
    extractedAt: main.extractedAt,
    modelCount: normalizedModels.length,
    endpointCount: endpointModels.length,
    graphDatasetCount: main.structuredDatasets.length,
    citation: "Artificial Analysis (2025). LLM benchmarks dataset.",
    license: "https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf",
  },
  benchmarks: benchmarks.map(({ scoreField, costSlug, scale, ...benchmark }) => ({
    ...benchmark,
    modelsWithData: normalizedModels.filter((model) => model.benchmarks[benchmark.id]).length,
  })),
  models: normalizedModels,
  endpointModels,
};

const full = {
  meta: compact.meta,
  renderedGraphDatasets: main.structuredDatasets,
  languageModelPayload: main.payload,
  endpointModelPayload: endpoints.payload,
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
