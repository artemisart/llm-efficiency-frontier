import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

export async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export function flightText(html) {
  return [...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)]
    .map((match) => JSON.parse(match[1]))
    .filter(([type, value]) => type === 1 && typeof value === "string")
    .map(([, value]) => value).join("");
}

export function manifests(html) {
  return [...new Map([...flightText(html).matchAll(
    /"manifest":\{"path":"([^"]+)","key":"([0-9a-f]{64})"\}/g,
  )].map(([, path, key]) => [path, { path, key }])).values()];
}

export function decodePayload(encrypted, hexKey) {
  const key = Buffer.from(hexKey, "hex");
  const iv = createHash("sha256").update(key).digest().subarray(0, 12);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(encrypted.subarray(-16));
  return JSON.parse(gunzipSync(Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)), decipher.final(),
  ])).toString("utf8"));
}

export function structuredDatasets(html) {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, json]) => JSON.parse(json)).filter((value) => value["@type"] === "Dataset");
}

// Read JSON arrays without evaluating any JavaScript from the source page.
export function codingIndex(html, sourceRows) {
  const version = structuredDatasets(html).find((item) => item.name === "Coding Agent Index")
    ?.description.match(/Coding Agent Index v(\d+(?:\.\d+)+)/)?.[1];
  if (!version) throw new Error("Cannot identify the Coding Agent Index version");
  const flight = flightText(html);
  const candidates = [];
  for (const match of flight.matchAll(/"(?:rows|benchmarkRows)":\[/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < flight.length; i++) {
      const ch = flight[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === "[") depth++;
      else if (ch === "]" && --depth === 0) {
        const rows = JSON.parse(flight.slice(start, i + 1)).filter((row) => row && typeof row === "object");
        if (rows.length && rows.every((row) => row.agentName && row.display && "indexScore" in row)) candidates.push(rows);
        break;
      }
    }
  }
  const raw = new Map((sourceRows ?? candidates.flat()).map((row) => [row.id, row]));
  const rows = [...raw.values()].filter((row) => Number.isFinite(row.indexScore))
    .map((row) => ({
      id: row.id, agentName: row.agentName, provider: row.provider,
      hostModelSlug: row.hostModelSlug, displayLabel: row.displayLabel,
      variantOf: row.variantOf, agentCreator: row.agentCreator?.name ?? row.display.creator?.agent ?? row.agentName,
      modelCreator: row.modelCreators?.map((creator) => creator.name).join(" + ") || row.display.creator?.model || row.provider, modelName: row.display.model,
      componentCount: row.indexComponentCount, evalCount: row.evalCount,
      indexScore: row.indexScore, costUsdPerTask: row.mean?.costUsd ?? null,
    }));
  if (!rows.length) throw new Error("No coding-agent scores found");
  const components = [...new Set([...raw.values()].flatMap((row) => row.evals.map((evaluation) => evaluation.evaluationDatasetSlug)))];
  return { sourceUrl: "https://artificialanalysis.ai/agents/coding-agents", extractedAt: new Date().toISOString(), version, components, rows };
}

export function validateDataset(data) {
  if (!data.benchmarks?.length || !data.models?.length) throw new Error("Empty benchmark dataset");
  const ids = new Set(data.benchmarks.map((benchmark) => benchmark.id));
  if (ids.size !== data.benchmarks.length) throw new Error("Duplicate benchmark IDs");
  if (new Set(data.models.map((model) => model.id)).size !== data.models.length) throw new Error("Duplicate model IDs");
  for (const model of data.models) {
    if (!Object.keys(model.benchmarks).length) throw new Error(`No data for ${model.id}`);
    for (const [id, value] of Object.entries(model.benchmarks)) {
      const validCost = Number.isFinite(value.cost) && value.cost > 0;
      if (!ids.has(id) || !Number.isFinite(value.score) || !validCost) throw new Error(`Invalid score/cost: ${model.id}, ${id}`);
    }
  }
  for (const benchmark of data.benchmarks) {
    const count = data.models.filter((model) => model.benchmarks[benchmark.id]).length;
    if (!count || count !== benchmark.modelsWithData) throw new Error(`Invalid model count for ${benchmark.id}: ${count}`);
  }
}

export function preserveUnavailable(data, previous, refreshedAt) {
  const historical = [];
  for (const benchmark of data.benchmarks) {
    if (benchmark.modelsWithData) {
      benchmark.refreshedAt = refreshedAt;
      continue;
    }
    const old = previous.benchmarks.find((item) => item.id === benchmark.id);
    if (!old?.modelsWithData || benchmark.sourceLabel !== "Artificial Analysis") throw new Error(`No fresh data for ${benchmark.id}`);
    historical.push(benchmark.id);
    Object.assign(benchmark, old, {
      historical: true,
      refreshedAt: old.refreshedAt ?? previous.meta.extractedAt,
      refreshNote: "Current source no longer provides score/cost pairs; retained the previous snapshot.",
    });
    const models = new Map(data.models.map((model) => [model.id, model]));
    for (const oldModel of previous.models.filter((model) => model.benchmarks[benchmark.id])) {
      let model = models.get(oldModel.id);
      if (!model) {
        model = { ...oldModel, benchmarks: {} };
        data.models.push(model);
        models.set(model.id, model);
      }
      model.benchmarks[benchmark.id] = oldModel.benchmarks[benchmark.id];
    }
  }
  return historical;
}
