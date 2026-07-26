import { readFile, writeFile } from "node:fs/promises";

const [
  basePath,
  frontierCodePath,
  deepSwePath,
  liveBenchTablePath,
  liveBenchCostPath,
  liveBenchCategoriesPath,
  outputPath,
] = process.argv.slice(2);

if (
  !basePath ||
  !frontierCodePath ||
  !deepSwePath ||
  !liveBenchTablePath ||
  !liveBenchCostPath ||
  !liveBenchCategoriesPath ||
  !outputPath
) {
  throw new Error(
    "Usage: node scripts/merge-external-benchmarks.mjs <base.json> <frontier-code.json> <deepswe.json> <livebench-table.csv> <livebench-cost.csv> <livebench-categories.json> <output.json>",
  );
}

const base = JSON.parse(await readFile(basePath, "utf8"));
const frontierCode = JSON.parse(await readFile(frontierCodePath, "utf8")).v1_1;
const deepSwe = JSON.parse(await readFile(deepSwePath, "utf8"));
const liveBenchRows = parseCsv(await readFile(liveBenchTablePath, "utf8"));
const liveBenchCosts = parseCsv(await readFile(liveBenchCostPath, "utf8"));
const liveBenchCategories = JSON.parse(await readFile(liveBenchCategoriesPath, "utf8"));

const externalBenchmarkIds = new Set([
  "frontier-code-1-1-main",
  "deep-swe-v1-1",
  "livebench-2026-06-25",
]);
const baseModels = base.models.filter(
  (model) =>
    !model.id.startsWith("frontier-code:") &&
    !model.id.startsWith("deep-swe:") &&
    !model.id.startsWith("livebench:"),
);

const artificialAnalysisMetadata = {
  "intelligence-index": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Weighted average cost per task (USD)",
    description:
      "A weighted composite of nine independently run evaluations spanning agentic work, coding, science, long-context reasoning, and factual reliability. It is a broad market signal rather than a substitute for workload-specific testing.",
  },
  "gdpval-aa-v2": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/gdpval-aa",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Measures agentic performance on 220 economically valuable tasks across 44 occupations and nine industries. Models browse, use a shell, and produce realistic deliverables such as spreadsheets, presentations, documents, and diagrams.",
  },
  "tau3-banking": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/tau3-banking",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Tests customer-support agents on realistic banking workflows. Success requires searching a large policy knowledge base, maintaining conversational state, and executing the correct sequence of tool calls without violating constraints.",
  },
  "terminal-bench-v2-1": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Evaluates agents on 89 verified terminal tasks across software engineering, system administration, security, data processing, and model training. Each task runs in a real sandbox and is checked by an executable verification suite.",
  },
  scicode: {
    sourceUrl: "https://artificialanalysis.ai/evaluations/scicode",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "A scientist-curated coding evaluation with 288 subproblems drawn from 80 laboratory problems across 16 scientific disciplines. It requires both domain reasoning and correct implementation of research-oriented numerical code.",
  },
  "humanitys-last-exam": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "A frontier academic benchmark of 2,500 expert-vetted questions across mathematics, science, engineering, humanities, and social science. Its breadth and difficulty are designed to resist simple saturation.",
  },
  "gpqa-diamond": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/gpqa-diamond",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "The hardest 198 questions from GPQA, written and validated by domain experts in physics, biology, and chemistry. The questions are deliberately Google-resistant and require graduate-level scientific reasoning.",
  },
  critpt: {
    sourceUrl: "https://artificialanalysis.ai/evaluations/critpt",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Tests research-scale physics reasoning on 71 composite challenges created by more than 50 researchers across 11 subfields. Guess-resistant answers include symbolic expressions, numerical arrays, and executable functions.",
  },
  "aa-omniscience": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/omniscience",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Measures factual reliability across 6,000 questions, 42 topics, and six economically relevant domains. The index rewards correct answers, penalizes confident hallucinations, and does not penalize abstention.",
  },
  "aa-lcr": {
    sourceUrl:
      "https://artificialanalysis.ai/evaluations/artificial-analysis-long-context-reasoning",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Average cost per task (USD)",
    description:
      "Evaluates whether models can retrieve, connect, and synthesize evidence from documents ranging from roughly 10,000 to 100,000 tokens. It targets reasoning over distant context, not simple needle retrieval.",
  },
};

const benchmarks = base.benchmarks
  .filter((benchmark) => !externalBenchmarkIds.has(benchmark.id))
  .map((benchmark) => ({
    ...benchmark,
    ...artificialAnalysisMetadata[benchmark.id],
  }));

benchmarks.push(
  {
    id: "frontier-code-1-1-main",
    label: "FrontierCode 1.1 Main",
    shortLabel: "FrontierCode",
    scoreSuffix: "%",
    description:
      "Cognition’s quality-focused coding benchmark asks whether an open-source maintainer would merge the generated change. Main contains 100 difficult tasks and scores correctness, tests, scope discipline, style, and codebase standards across five rollouts per effort.",
    costNote:
      "Average model/API cost per FrontierCode Main task; the plotted score is the quality-adjusted mergeability score.",
    costAxisLabel: "Average cost per task (USD)",
    sourceUrl: "https://cognition.com/frontiercode",
    sourceLabel: "Cognition",
    modelsWithData: 0,
  },
  {
    id: "deep-swe-v1-1",
    label: "DeepSWE v1.1",
    shortLabel: "DeepSWE",
    scoreSuffix: "%",
    description:
      "A contamination-resistant, long-horizon software-engineering benchmark with 113 original tasks across 91 repositories and five languages. Hand-written behavioral verifiers score complete mini-swe-agent rollouts rather than patches copied from historical pull requests.",
    costNote:
      "Mean published cost per scored rollout; pass@1 is the share of individual attempts that pass. Provider accounting can differ for cached tokens.",
    costAxisLabel: "Mean rollout cost (USD)",
    sourceUrl: "https://deepswe.datacurve.ai/",
    sourceLabel: "Datacurve",
    modelsWithData: 0,
  },
  {
    id: "livebench-2026-06-25",
    label: "LiveBench 2026-06-25",
    shortLabel: "LiveBench",
    scoreSuffix: "",
    description:
      "A contamination-conscious benchmark of 23 objective tasks across reasoning, coding, agentic coding, mathematics, data analysis, language, and instruction following. Questions refresh every six months and are graded against verifiable answers.",
    costNote:
      "Published cost per successful task, which combines per-question spend with the model’s success rate rather than showing raw API price.",
    costAxisLabel: "Cost per successful task (USD)",
    sourceUrl: "https://livebench.ai/",
    sourceLabel: "LiveBench",
    modelsWithData: 0,
  },
);

const frontierModels = [];
for (const [modelName, efforts] of Object.entries(frontierCode.data)) {
  for (const [effort, subsets] of Object.entries(efforts)) {
    const metrics = subsets.main;
    if (!metrics || !Number.isFinite(metrics.new_score) || !Number.isFinite(metrics.cost)) {
      continue;
    }
    frontierModels.push(
      externalModel({
        id: `frontier-code:${slugify(modelName)}:${effort}`,
        baseName: modelName,
        effort,
        benchmarkId: "frontier-code-1-1-main",
        score: metrics.new_score * 100,
        cost: metrics.cost,
        baseModels,
      }),
    );
  }
}

const deepSweModels = deepSwe.rows
  .filter(
    (row) =>
      Number.isFinite(row.pass_at_1) &&
      Number.isFinite(row.mean_cost_usd) &&
      row.mean_cost_usd > 0,
  )
  .map((row) =>
    externalModel({
      id: `deep-swe:${row.model}:${row.reasoning_effort}`,
      baseName: humanizeModel(row.model),
      effort: row.reasoning_effort,
      benchmarkId: "deep-swe-v1-1",
      score: row.pass_at_1 * 100,
      cost: row.mean_cost_usd,
      baseModels,
      slugHint: row.model,
    }),
  );

const liveBenchCostMap = new Map(liveBenchCosts.map((row) => [row.model, row]));
const liveBenchModels = liveBenchRows.flatMap((row) => {
  const cost = Number(liveBenchCostMap.get(row.model)?.cost_per_successful_task);
  if (!Number.isFinite(cost) || cost <= 0) return [];
  const categoryScores = Object.values(liveBenchCategories).map(
    (tasks) =>
      tasks.reduce((total, task) => total + Number(row[task]), 0) / tasks.length,
  );
  const overall =
    categoryScores.reduce((total, categoryScore) => total + categoryScore, 0) /
    categoryScores.length;
  const { baseSlug, effort } = liveBenchIdentity(row.model);
  return [
    externalModel({
      id: `livebench:${row.model}`,
      baseName: humanizeModel(baseSlug),
      effort,
      benchmarkId: "livebench-2026-06-25",
      score: overall,
      cost,
      baseModels,
      slugHint: baseSlug,
    }),
  ];
});

const models = [...baseModels, ...frontierModels, ...deepSweModels, ...liveBenchModels];
for (const benchmark of benchmarks) {
  benchmark.modelsWithData = models.filter(
    (model) => model.benchmarks[benchmark.id],
  ).length;
}

const output = {
  ...base,
  meta: {
    ...base.meta,
    externalModelCount:
      frontierModels.length + deepSweModels.length + liveBenchModels.length,
    sourceCount: 4,
  },
  benchmarks,
  models,
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      benchmarkCount: benchmarks.length,
      modelRecords: models.length,
      externalRecords: output.meta.externalModelCount,
      plottedByBenchmark: Object.fromEntries(
        benchmarks.map((benchmark) => [benchmark.id, benchmark.modelsWithData]),
      ),
    },
    null,
    2,
  ),
);

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return rows.map((row) =>
    Object.fromEntries(row.split(",").map((value, index) => [columns[index], value])),
  );
}

function externalModel({
  id,
  baseName,
  effort,
  benchmarkId,
  score,
  cost,
  baseModels,
  slugHint = "",
}) {
  const catalogModel = findCatalogModel(baseModels, baseName, effort, slugHint);
  const creator = catalogModel?.creator ?? inferCreator(`${baseName} ${slugHint}`);
  const displayName = effort ? `${baseName} (${effort})` : baseName;
  return {
    id,
    slug: slugHint || slugify(baseName),
    name: displayName,
    shortName: displayName,
    releaseDate: catalogModel?.releaseDate ?? null,
    deprecated: false,
    reasoning: Boolean(effort) || catalogModel?.reasoning || false,
    openWeights: catalogModel?.openWeights ?? inferOpenWeights(`${baseName} ${slugHint}`),
    creator,
    benchmarks: {
      [benchmarkId]: {
        score,
        cost,
      },
    },
  };
}

function findCatalogModel(models, baseName, effort, slugHint) {
  const normalizedBase = normalizeModelName(baseName || slugHint);
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

function liveBenchIdentity(model) {
  const patterns = [
    ["max", /-(?:max-effort|max)$/],
    ["xhigh", /-(?:xhigh-effort|xhigh)$/],
    ["high", /-(?:high-effort|high)$/],
    ["medium", /-(?:medium-effort|medium)$/],
    ["low", /-(?:low-effort|low)$/],
    ["minimal", /-(?:minimal-effort|minimal)$/],
  ];
  for (const [effort, pattern] of patterns) {
    if (pattern.test(model)) {
      return {
        effort,
        baseSlug: model
          .replace(pattern, "")
          .replace(/-\d{8}-thinking-\d+k$/, "")
          .replace(/-thinking-auto$/, ""),
      };
    }
  }
  return {
    effort: null,
    baseSlug: model
      .replace(/-\d{8}-thinking-\d+k$/, "")
      .replace(/-thinking-auto$/, ""),
  };
}

function humanizeModel(value) {
  let result = value
    .replace(/^gpt-(\d)[.-](\d)/, "GPT-$1.$2")
    .replace(/^claude-(opus|sonnet|fable)-(\d)[.-](\d)/, (_, family, major, minor) =>
      `Claude ${titleCase(family)} ${major}.${minor}`,
    )
    .replace(/^gemini-(\d)[.-](\d)/, "Gemini $1.$2")
    .replace(/^deepseek-v(\d)[.-](\d)/, "DeepSeek V$1.$2")
    .replace(/^grok-(\d)[.-](\d)/, "Grok $1.$2")
    .replace(/^glm-(\d)[.-](\d)/, "GLM-$1.$2")
    .replace(/^kimi-k(\d)[.-](\d)/, "Kimi K$1.$2")
    .replace(/^qwen(\d)[.-](\d)/, "Qwen$1.$2")
    .replace(/^minimax-m(\d)/, "MiniMax-M$1")
    .replace(/^muse-spark-(\d)-(\d)/, "Muse Spark $1.$2");
  result = result
    .split("-")
    .map((part) => {
      const canonical = {
        gpt: "GPT",
        glm: "GLM",
        deepseek: "DeepSeek",
        minimax: "MiniMax",
        kimi: "Kimi",
        qwen: "Qwen",
        claude: "Claude",
        gemini: "Gemini",
        grok: "Grok",
        muse: "Muse",
      }[part.toLowerCase()];
      return canonical ?? titleCase(part);
    })
    .join(" ");
  return result
    .replace(/\s+/g, " ")
    .replace(/\bGPT (?=\d)/, "GPT-")
    .replace(/\bGLM (?=\d)/, "GLM-")
    .trim();
}

function inferCreator(value) {
  const normalized = value.toLowerCase();
  const entries = [
    [/claude/, ["anthropic", "Anthropic", "#CC785C"]],
    [/\bgpt\b|gpt-/, ["openai", "OpenAI", "#1f1f1f"]],
    [/gemini/, ["google", "Google", "#34A853"]],
    [/deepseek/, ["deepseek", "DeepSeek", "#2243e6"]],
    [/grok/, ["xai", "xAI", "#736cd3"]],
    [/kimi/, ["kimi", "Kimi", "#047AFE"]],
    [/\bglm\b|glm-/, ["z-ai", "Z AI", "#1c7ff8"]],
    [/qwen/, ["alibaba", "Alibaba", "#ff7018"]],
    [/minimax/, ["minimax", "MiniMax", "#3b82f6"]],
    [/muse/, ["meta", "Meta", "#0089f4"]],
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
  return /deepseek|qwen|glm|kimi/i.test(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
