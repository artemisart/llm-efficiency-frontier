import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceUrl = "https://artificialanalysis.ai/";
const html = args.has("--html")
  ? await readFile(args.get("--html"), "utf8")
  : await (await fetch(sourceUrl)).text();

const chunks = [];
for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
  try {
    const payload = JSON.parse(match[1]);
    if (payload[0] === 1 && typeof payload[1] === "string") chunks.push(payload[1]);
  } catch {
    // Ignore non-JSON bootstrap calls.
  }
}
const flight = chunks.join("");
const manifestMatches = [
  ...flight.matchAll(/"manifest":\{"path":"([^"]+)","key":"([0-9a-f]{64})"\}/g),
];
const manifestMatch = args.has("--manifest-path")
  ? manifestMatches.find((match) => match[1] === args.get("--manifest-path"))
  : args.has("--payload")
    ? manifestMatches.find(
      (match) => basename(match[1]) === basename(args.get("--payload")),
    )
    : manifestMatches[0];
if (!manifestMatch) throw new Error("Could not find the encrypted graph-data manifest.");

const [, manifestPath, manifestKey] = manifestMatch;
const encrypted = args.has("--payload")
  ? await readFile(args.get("--payload"))
  : Buffer.from(
    await (
      await fetch(new URL(manifestPath, sourceUrl))
    ).arrayBuffer(),
  );

const key = Buffer.from(manifestKey, "hex");
const iv = createHash("sha256").update(key).digest().subarray(0, 12);
const authTag = encrypted.subarray(encrypted.length - 16);
const ciphertext = encrypted.subarray(0, encrypted.length - 16);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));

const structuredDatasets = [];
for (const match of html.matchAll(
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
)) {
  try {
    const value = JSON.parse(match[1]);
    if (value?.["@type"] === "Dataset" && Array.isArray(value.data)) {
      structuredDatasets.push(value);
    }
  } catch {
    // Ignore unrelated structured-data scripts.
  }
}

const result = {
  source: sourceUrl,
  extractedAt: new Date().toISOString(),
  manifestPath,
  structuredDatasets,
  payload,
};

const output = args.get("--output");
if (output) {
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      manifestPath,
      encryptedBytes: encrypted.length,
      payloadKeys: Object.keys(payload),
      payloadCounts: Object.fromEntries(
        Object.entries(payload)
          .filter(([, value]) => Array.isArray(value))
          .map(([keyName, value]) => [keyName, value.length]),
      ),
      structuredDatasets: structuredDatasets.map((dataset) => ({
        name: dataset.name,
        rows: dataset.data.length,
      })),
      output,
    }
  )
);
