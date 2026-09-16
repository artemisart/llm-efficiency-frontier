import { createHash } from "node:crypto";
import { download } from "./refresh-sources.mjs";

// Parse only object literals, string keys, and numbers. Never execute source JS.
function readRateObject(source, start) {
  let cursor = start;
  const space = () => { while (/\s/.test(source[cursor] ?? "x")) cursor++; };
  const key = () => {
    space();
    const match = source.slice(cursor).match(/^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*)/);
    if (!match) throw new Error("Unsupported pricing key");
    cursor += match[0].length;
    return match[0].startsWith('"') ? JSON.parse(match[0]) : match[0];
  };
  function value() {
    space();
    if (source[cursor] === "{") {
      cursor++;
      const object = Object.create(null);
      space();
      while (source[cursor] !== "}") {
        const name = key();
        space();
        if (source[cursor++] !== ":") throw new Error("Unsupported pricing literal");
        if (Object.hasOwn(object, name)) throw new Error("Duplicate pricing key");
        object[name] = value();
        space();
        if (source[cursor] !== ",") break;
        cursor++;
      }
      if (source[cursor++] !== "}") throw new Error("Unclosed pricing literal");
      return object;
    }
    const match = source.slice(cursor).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error("Unsupported pricing value");
    cursor += match[0].length;
    return Number(match[0]);
  }
  return value();
}

export function validateAdjustments(adjustments) {
  if (!adjustments || !Object.keys(adjustments).length) throw new Error("Empty DeepSWE pricing adjustments");
  const rateCard = (card) => card && Object.keys(card).length === 3 &&
    ["input", "cached", "output"].every((key) => Number.isFinite(card[key]) && card[key] > 0);
  const pair = (entry) => entry && Object.keys(entry).length === 2 && rateCard(entry.from) && rateCard(entry.to);
  for (const [model, entry] of Object.entries(adjustments)) {
    if (!pair(entry) && !(entry && Object.entries(entry).length && Object.entries(entry).every(([version, value]) => /^v\d+(?:\.\d+)?$/.test(version) && pair(value)))) {
      throw new Error(`Unsupported DeepSWE pricing policy for ${model}`);
    }
  }
}

export function extractAdjustments(source) {
  const matches = [...source.matchAll(/=\s*(\{\s*"[^"\n]+"\s*:\s*\{\s*(?:from\s*:|(?:"v\d[^"\n]*"|v\d+)\s*:\s*\{\s*from\s*:))/g)];
  const candidates = [];
  for (const match of matches) {
    const start = match.index + match[0].indexOf("{");
    const object = readRateObject(source, start);
    validateAdjustments(object);
    candidates.push(object);
  }
  if (candidates.length !== 1) throw new Error(`Expected one DeepSWE pricing table, found ${candidates.length}; review upstream display code`);
  return candidates[0];
}

export async function downloadDeepSwePricing() {
  const url = "https://deepswe.datacurve.ai/";
  const html = (await download(url)).toString();
  const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.js)"/g)].map((match) => match[1]))];
  // The table is in the main module (or a preloaded artifact helper), not a fixed build hash.
  const results = await Promise.allSettled(paths.map(async (path) => {
    const sourceUrl = new URL(path, url).href;
    const source = (await download(sourceUrl)).toString();
    if (!/from:\{input:/.test(source)) return null;
    return { sourceUrl, sourceSha256: createHash("sha256").update(source).digest("hex"), adjustments: extractAdjustments(source) };
  }));
  const tables = [];
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
    if (result.value) tables.push(result.value);
  }
  if (tables.length !== 1) throw new Error("DeepSWE pricing source changed; refusing to publish unadjusted costs");
  return { ...tables[0], benchmarkVersion: "v1.1", retrievedAt: new Date().toISOString(), methodologyUrl: `${url}changelog`, policy: "Match DeepSWE displayed pricing, including its promotional and peak-rate choices." };
}

export function deepSweCost(row, pricing) {
  validateAdjustments(pricing.adjustments);
  if (pricing.benchmarkVersion !== "v1.1") throw new Error("DeepSWE pricing edition does not match v1.1");
  const model = row.model.split("/").pop().replace(/[._]/g, "-").toLowerCase();
  const entry = pricing.adjustments[model];
  const rates = entry?.from ? entry : entry?.[pricing.benchmarkVersion];
  const rawCost = row.mean_cost_usd;
  if (!rates) return { cost: rawCost, rawCost, costBasis: "source-reported" };
  let factor;
  if (Number.isFinite(row.mean_input_tokens) && Number.isFinite(row.mean_output_tokens)) {
    const input = row.mean_input_tokens;
    const cached = Number.isFinite(row.mean_cache_tokens) ? row.mean_cache_tokens : 0;
    const output = row.mean_output_tokens;
    const spend = (card) => (input - cached) * card.input + cached * card.cached + output * card.output;
    const original = spend(rates.from);
    if (original > 0) factor = spend(rates.to) / original;
  } else {
    const ratios = ["input", "cached", "output"].map((key) => rates.to[key] / rates.from[key]);
    if (ratios.every((ratio) => Math.abs(ratio - ratios[0]) < 1e-9)) factor = ratios[0];
  }
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`Cannot reprice ${row.model}: missing token mix for nonuniform rates`);
  return { cost: rawCost * factor, rawCost, pricingFactor: factor, costBasis: "deepswe-display-pricing" };
}
