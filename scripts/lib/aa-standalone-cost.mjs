// The evaluation pages publish canonical token counts and per-model rate cards.
// These evaluations have no current Intelligence Index weight. Mirror
// AA's standalone cost calculation rather than borrowing a composite cost.
export const AA_STANDALONE_EVALUATIONS = {
  "tau3-banking": { field: "tauBanking", taskCount: 97 },
  "terminalbench-2-1": { field: "terminalBench21", taskCount: 89 },
  "gpqa-diamond": { field: "gpqa", taskCount: 198 },
  "terminal-bench-science": { field: "terminalBenchScience", taskCount: 70 },
  "aa-analyst-agent": { field: "analystAgent", taskCount: 80 },
  "harvey-lab-aa": { field: "harveyLab", taskCount: 120 },
  "enterprise-ops-gym-aa": { field: "enterpriseOpsGym", taskCount: 1117 },
  "itbench-aa": { field: "itbenchSre", tokenField: "itBench", taskCount: 59 },
  "mlcr-aa": { field: "mlcrOverall", tokenField: "mlcr", taskCount: 60 },
  "mmmu-pro": { field: "mmmuPro", taskCount: 1730 },
  frontiercode: { field: "frontierCode", taskCount: 100 },
};

export function normalizeStandaloneEvaluations(payload) {
  if (!Array.isArray(payload?.models) || !payload.models.some((model) => model.canonicalEvalTokenCounts)) {
    throw new Error("Missing AA standalone evaluation token data");
  }
  const fields = Object.values(AA_STANDALONE_EVALUATIONS).map(({ field }) => field);
  const tokenFields = Object.values(AA_STANDALONE_EVALUATIONS).map(({ field, tokenField }) => tokenField ?? field);
  return {
    models: payload.models.map((model) => Object.fromEntries([
      ...["id", ...fields, "price1mInputTokens", "price1mOutputTokens", "cacheHitPrice", "cacheWritePrice", "cacheHitRate"].map((field) => [field, model[field]]),
      ["canonicalEvalTokenCounts", Object.fromEntries(tokenFields.flatMap((field) => model.canonicalEvalTokenCounts?.[field] ? [[field, model.canonicalEvalTokenCounts[field]]] : []))],
    ])),
    priceFallbackByModelId: Object.fromEntries(Object.entries(payload.priceFallbackByModelId ?? {}).map(([id, fallback]) => [id, {
      fallbackPrice: fallback.fallbackPrice,
      rateByEval: Object.fromEntries(Object.keys(AA_STANDALONE_EVALUATIONS).flatMap((slug) => fallback.rateByEval?.[slug] ? [[slug, fallback.rateByEval[slug]]] : [])),
    }])),
  };
}

export function standaloneAaCost(model, slug, fallback) {
  const definition = AA_STANDALONE_EVALUATIONS[slug];
  const tokens = model?.canonicalEvalTokenCounts?.[definition?.tokenField ?? definition?.field];
  if (!tokens || model.price1mInputTokens == null || model.price1mOutputTokens == null) return null;
  const nonnegative = (value) => Number.isFinite(value) && value >= 0;
  const fraction = (value) => nonnegative(value) && value <= 1;
  if (![tokens.input, tokens.answer, tokens.reasoning].every(nonnegative)) throw new Error(`Invalid AA token counts: ${model.id}, ${slug}`);
  let split;
  if (tokens.cacheableInput == null) {
    split = { nonCacheInput: tokens.input, cacheRead: 0, cacheWrite: 0, answer: tokens.answer, reasoning: tokens.reasoning };
  } else {
    if (model.cacheHitRate == null) return null;
    if (!nonnegative(tokens.cacheableInput) || tokens.cacheableInput > tokens.input || !fraction(model.cacheHitRate)) throw new Error(`Invalid AA cache counts: ${model.id}, ${slug}`);
    // AA bills all non-hit input at the cache-write rate for cacheable runs.
    const hits = tokens.cacheableInput * model.cacheHitRate;
    split = { nonCacheInput: 0, cacheRead: hits, cacheWrite: tokens.input - hits, answer: tokens.answer, reasoning: tokens.reasoning };
  }
  const primary = { input: model.price1mInputTokens, output: model.price1mOutputTokens, cacheHit: model.cacheHitPrice, cacheWrite: model.cacheWritePrice };
  const rates = fallback?.rateByEval?.[slug];
  const spend = (prices) => {
    if (!prices) throw new Error(`Missing AA fallback prices: ${model.id}`);
    const card = { nonCacheInput: prices.input, cacheRead: prices.cacheHit ?? prices.input, cacheWrite: prices.cacheWrite ?? prices.input, answer: prices.output, reasoning: prices.output };
    if (!Object.values(card).every(nonnegative)) throw new Error(`Invalid AA prices: ${model.id}`);
    return Object.fromEntries(Object.entries(split).map(([key, count]) => [key, count / 1e6 * card[key]]));
  };
  const costs = spend(primary);
  if (rates) {
    if (![rates.input, rates.output, rates.reasoning].every(fraction)) throw new Error(`Invalid AA fallback shares: ${model.id}`);
    const fallbackCosts = spend(fallback.fallbackPrice);
    for (const key of Object.keys(costs)) {
      const share = key === "answer" ? rates.output : key === "reasoning" ? rates.reasoning : rates.input;
      costs[key] = costs[key] * (1 - share) + fallbackCosts[key] * share;
    }
  }
  return Object.values(costs).reduce((sum, cost) => sum + cost, 0) / definition.taskCount;
}
