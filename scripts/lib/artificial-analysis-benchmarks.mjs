// AA Intelligence Index v4.3 component weights, verified against the publisher's
// evaluation definitions. weightedCostPerTask is a contribution to the composite;
// divide by its index weight to obtain a standalone evaluation's cost per task.
export const AA_INDEX_VERSION = "4.3";
export const AA_COMPONENT_WEIGHTS = {
  "aa-briefcase": 0.15,
  "gdpval-aa": 0.1,
  "automationbench-aa": 0.05,
  "terminalbench-4-0": 0.1,
  scicode: 0.1,
  "humanitys-last-exam": 0.1,
  "gdp-pdf": 0.1,
  critpt: 0.1,
  omniscience: 0.15,
  "artificial-analysis-long-context-reasoning": 0.05,
};

const definitions = [
  {
    id: "intelligence-index",
    label: "Intelligence Index",
    shortLabel: "Index",
    scoreField: "intelligenceIndex",
    costSlug: null,
    scale: 1,
    scoreSuffix: "",
    description:
      "Artificial Analysis Intelligence Index v4.3, combining ten independently run evaluations.",
    costNote: "Weighted average cost per Intelligence Index task.",
  },
  {
    id: "gdpval-aa-v2",
    label: "GDPval-AA v2",
    shortLabel: "GDPval",
    scoreField: "gdpval",
    costSlug: "gdpval-aa",
    scale: 1,
    scoreSuffix: "",
    description:
      "Professional-task performance measured with AA’s published pairwise-comparison Elo.",
    costNote: "Average cost per GDPval-AA task.",
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
    costNote: "Average cost per τ³-Banking task.",
  },
  {
    id: "terminal-bench-v2-1",
    label: "Terminal-Bench v2.1",
    shortLabel: "Terminal",
    scoreField: "terminalBench21",
    costSlug: "terminalbench-2-1",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Capability on realistic terminal-based tasks that require planning, tools, and execution.",
    costNote: "Average cost per Terminal-Bench v2.1 task.",
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
    costNote: "Average cost per SciCode task.",
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
    costNote: "Average cost per Humanity’s Last Exam task.",
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
    costNote: "Average cost per GPQA Diamond task.",
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
      "Research-level physics reasoning evaluation.",
    costNote: "Average cost per CritPt task.",
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
    costNote: "Average cost per AA-Omniscience task.",
  },
  {
    id: "aa-lcr",
    label: "AA-LCR v1.1",
    shortLabel: "AA-LCR",
    scoreField: "lcr",
    costSlug: "artificial-analysis-long-context-reasoning",
    scale: 100,
    scoreSuffix: "%",
    description:
      "Artificial Analysis Long Context Reasoning benchmark for retrieving and using distant context.",
    costNote: "Average cost per AA-LCR task.",
  },
  {
    id: "aa-briefcase", label: "AA-Briefcase", shortLabel: "Briefcase",
    scoreField: "briefcaseBreakdown.overall.elo", costSlug: "aa-briefcase", scale: 1, scoreSuffix: "",
    description: "Agentic knowledge work across 91 tasks in four multi-week business projects. The headline Elo combines rubric checks, analytical quality, and presentation.",
    costNote: "Average cost per AA-Briefcase task.",
  },
  {
    id: "automationbench-aa", label: "AutomationBench-AA", shortLabel: "Automation",
    scoreField: "automationBenchPartialScore", costSlug: "automationbench-aa", scale: 100, scoreSuffix: "%",
    description: "Workflow automation across 657 tasks in simulated business applications. Scores measure the share of objectives completed, with zero credit when a guardrail is violated.",
    costNote: "Average cost per AutomationBench-AA task.",
  },
  {
    id: "terminal-bench-4-0", label: "Terminal-Bench 4.0", shortLabel: "Terminal 4.0",
    scoreField: "terminalBench40", costSlug: "terminalbench-4-0", scale: 100, scoreSuffix: "%",
    description: "A harder set of 66 terminal tasks across software, science, operations, and security. Artificial Analysis reports pass@1 averaged over three attempts per task.",
    costNote: "Average cost per Terminal-Bench 4.0 task.",
  },
  {
    id: "gdp-pdf", label: "GDP.pdf", shortLabel: "GDP.pdf",
    scoreField: "gdpPdfAllPass", costSlug: "gdp-pdf", scale: 100, scoreSuffix: "%",
    description: "Professional reasoning over long PDF documents across 100 tasks and ten domains. The All-pass score counts attempts that satisfy every grading criterion.",
    costNote: "Average cost per GDP.pdf task.",
  },
];

const artificialAnalysisMetadata = {
  "intelligence-index": {
    sourceUrl: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
    sourceLabel: "Artificial Analysis",
    costAxisLabel: "Weighted average cost per task (USD)",
    description:
      "Artificial Analysis Intelligence Index v4.3, combining ten independently run evaluations.",
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
    sourceUrl: "https://artificialanalysis.ai/evaluations/terminalbench-2-1",
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
      "Expert-vetted academic questions across mathematics, science, engineering, humanities, and social science, using AA’s evaluated subset.",
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
      "Tests research-scale physics reasoning with composite challenges. Answers include symbolic expressions, numerical arrays, and executable functions.",
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

const componentOrder = Object.keys(AA_COMPONENT_WEIGHTS);
export const AA_BENCHMARKS = definitions.map((benchmark) => ({
  ...benchmark,
  sourceUrl: `https://artificialanalysis.ai/evaluations/${benchmark.costSlug ?? "artificial-analysis-intelligence-index"}`,
  sourceLabel: "Artificial Analysis",
  costAxisLabel: benchmark.costSlug ? "Average cost per task (USD)" : "Weighted average cost per task (USD)",
  ...artificialAnalysisMetadata[benchmark.id],
})).sort((left, right) => {
  const order = (benchmark) => benchmark.id === "intelligence-index" ? -1 :
    componentOrder.includes(benchmark.costSlug) ? componentOrder.indexOf(benchmark.costSlug) : 100;
  return order(left) - order(right);
});

export function aaScore(model, benchmark) {
  return benchmark.scoreField.split(".").reduce((value, key) => value?.[key], model);
}

export function aaBenchmarkCost(model, benchmark) {
  const costs = model.intelligenceIndexCostPerTask;
  if (!benchmark.costSlug) return costs?.cost?.total ?? null;
  const weight = AA_COMPONENT_WEIGHTS[benchmark.costSlug];
  // Retired versions remain separate historical charts, never borrowed costs.
  if (!weight) return null;
  const weighted = costs?.evaluations?.find((evaluation) => evaluation.slug === benchmark.costSlug)?.weightedCostPerTask;
  return Number.isFinite(weighted) ? weighted / weight : null;
}

export function validateAaCoverage(models, metadata) {
  if (metadata?.intelligenceVersion !== AA_INDEX_VERSION) {
    throw new Error(`Unsupported AA Intelligence Index version ${metadata?.intelligenceVersion ?? "unknown"}; review the benchmark registry and weights`);
  }
  const expected = Object.keys(AA_COMPONENT_WEIGHTS).sort();
  const observed = [...new Set(models.flatMap((model) => model.intelligenceIndexCostPerTask?.evaluations?.map((item) => item.slug) ?? []))].sort();
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw new Error(`AA evaluation lineup changed. Expected ${expected.join(", ")}; found ${observed.join(", ")}. Update the registry before refreshing.`);
  }
  if (metadata.intelligenceComponents && JSON.stringify([...metadata.intelligenceComponents].sort()) !== JSON.stringify(expected)) {
    throw new Error("AA published component list changed; review the benchmark registry");
  }
}
