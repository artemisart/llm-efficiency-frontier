import { readFile } from "node:fs/promises";

const input = process.argv[2] ?? "/tmp/artificial-analysis-home.html";
const html = await readFile(input, "utf8");

const linkedDatasets = [];
for (const match of html.matchAll(
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
)) {
  try {
    const value = JSON.parse(match[1]);
    if (value?.["@type"] === "Dataset" && Array.isArray(value.data)) {
      linkedDatasets.push({
        name: value.name,
        description: value.description,
        length: value.data.length,
        keys: [...new Set(value.data.slice(0, 20).flatMap((item) => Object.keys(item ?? {})))],
        sample: value.data.slice(0, 2),
      });
    }
  } catch {
    // Ignore other structured-data scripts.
  }
}

console.error(JSON.stringify({ linkedDatasets }, null, 2));

const chunks = [];
for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
  try {
    const payload = JSON.parse(match[1]);
    if (payload[0] === 1 && typeof payload[1] === "string") chunks.push(payload[1]);
  } catch {
    // Ignore bootstrap calls that are not JSON-only payloads.
  }
}

const flight = chunks.join("");

function readBalancedArray(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return null;
}

let cursor = 0;
let datasetIndex = 0;
while ((cursor = flight.indexOf('"data":', cursor)) !== -1) {
  const arrayStart = flight.indexOf("[", cursor + 7);
  if (arrayStart === -1) break;
  const raw = readBalancedArray(flight, arrayStart);
  cursor = arrayStart + Math.max(raw?.length ?? 1, 1);
  if (!raw) continue;

  try {
    const data = JSON.parse(raw);
    const context = flight.slice(Math.max(0, cursor - raw.length - 1800), cursor - raw.length);
    const titles = [
      ...context.matchAll(/"(?:title|label|name|xAxisLabel|yAxisLabel)":"([^"]{2,180})"/g),
    ]
      .slice(-12)
      .map((match) => match[1]);
    const keys = [...new Set(data.slice(0, 20).flatMap((item) => Object.keys(item ?? {})))];
    console.log(
      JSON.stringify({
        index: datasetIndex,
        length: data.length,
        keys,
        nearbyLabels: titles,
        sample: data.slice(0, 2),
      }),
    );
    datasetIndex += 1;
  } catch {
    // Some "data" props are split across flight references rather than inline JSON.
  }
}

console.error(
  JSON.stringify({
    htmlBytes: html.length,
    flightBytes: flight.length,
    chunkCount: chunks.length,
    datasetCount: datasetIndex,
  }),
);
