import { readFile, writeFile } from "node:fs/promises";

const [datasetPath, fullSourcePath, outputPath] = process.argv.slice(2);

if (!datasetPath || !fullSourcePath || !outputPath) {
  throw new Error(
    "Usage: node scripts/enrich-model-sizes.mjs <benchmark-data.json> <artificial-analysis-full.json> <output.json>",
  );
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const source = JSON.parse(await readFile(fullSourcePath, "utf8"));
const catalog = source.languageModelPayload.models.filter(
  (model) => Number.isFinite(model.parameters) && model.parameters > 0,
);
const parametersById = new Map(catalog.map((model) => [model.id, model.parameters]));
const parametersByName = new Map();

for (const model of catalog) {
  const key = normalizeModelName(model.name);
  const values = parametersByName.get(key) ?? new Set();
  values.add(model.parameters);
  parametersByName.set(key, values);
}

const models = dataset.models.map((model) => {
  const exact = parametersById.get(model.id);
  if (Number.isFinite(exact)) return { ...model, parameters: exact };

  const candidateName =
    model.baseName ??
    model.name
      .split("·")
      .at(-1)
      ?.trim();
  const candidateKey = normalizeModelName(candidateName ?? model.name);
  const matches = [...parametersByName.entries()].filter(
    ([key]) => key === candidateKey || key.startsWith(candidateKey),
  );
  const values = new Set(matches.flatMap(([, sizes]) => [...sizes]));
  return {
    ...model,
    parameters: values.size === 1 ? [...values][0] : null,
  };
});

const output = { ...dataset, models };
await writeFile(outputPath, `${JSON.stringify(output)}\n`);

console.log(
  JSON.stringify(
    {
      outputPath,
      knownModelSizes: models.filter(
        (model) => Number.isFinite(model.parameters) && model.parameters > 0,
      ).length,
      totalModels: models.length,
    },
    null,
    2,
  ),
);

function normalizeModelName(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
