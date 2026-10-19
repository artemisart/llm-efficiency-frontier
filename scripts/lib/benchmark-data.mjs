export function isPlottableBenchmark(value) {
  return Boolean(
    value &&
      Number.isFinite(value.score) &&
      Number.isFinite(value.cost) &&
      value.cost > 0,
  );
}

export function hasPlottableBenchmark(model) {
  return Object.values(model.benchmarks ?? {}).some(isPlottableBenchmark);
}

export function plottableModels(models) {
  return models.filter(hasPlottableBenchmark);
}

export function isExternalBenchmarkModel(model) {
  return /^(?:coding-index|deep-swe|frontier-code|livebench|terminal-bench):/.test(model.id);
}

export function modelCountMeta(meta, models) {
  return {
    modelCount: models.filter((model) => !isExternalBenchmarkModel(model)).length,
    sourceModelCount: meta.sourceModelCount ?? meta.modelCount,
    externalModelCount: models.filter(isExternalBenchmarkModel).length,
  };
}

// Keep independently evaluated versions of the same task set adjacent without
// merging their point identities, scores, costs, or benchmark editions.
export function groupBenchmarkSources(benchmarks) {
  const families = {
    "terminal-bench-official-4-0": "terminal-bench-4-0",
    "terminal-bench-official-2-1": "terminal-bench-v2-1",
    "terminal-bench-science-official-0-1": "aa-terminal-bench-science-0-1",
    "frontier-code-1-1-main": "aa-frontier-code-1-1-main",
  };
  const order = new Map();
  for (const benchmark of benchmarks) {
    const family = families[benchmark.id] ?? benchmark.id;
    if (!order.has(family)) order.set(family, order.size);
  }
  return [...benchmarks].sort((left, right) => order.get(families[left.id] ?? left.id) - order.get(families[right.id] ?? right.id));
}
