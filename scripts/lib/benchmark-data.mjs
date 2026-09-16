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
  return /^(?:coding-index|deep-swe|frontier-code|livebench):/.test(model.id);
}

export function modelCountMeta(meta, models) {
  return {
    modelCount: models.filter((model) => !isExternalBenchmarkModel(model)).length,
    sourceModelCount: meta.sourceModelCount ?? meta.modelCount,
    externalModelCount: models.filter(isExternalBenchmarkModel).length,
  };
}
