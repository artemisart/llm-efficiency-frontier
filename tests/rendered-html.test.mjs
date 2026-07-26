import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete benchmark gallery in the intended order", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Model Economics/);
  assert.match(html, /class="chart-toolbar"/);
  assert.match(html, /class="filter-control multi-select-control"/);
  assert.match(html, />Known sizes only</);
  assert.match(html, />Performance →</);
  assert.doesNotMatch(html, />Performance vs\. cost</);
  assert.doesNotMatch(html, />Weighted average cost per Intelligence Index task\.</);

  const intelligence = html.indexOf("<h3>Intelligence Index</h3>");
  const coding = html.indexOf("<h3>AA Coding Agent Index v1.3</h3>");
  const gdpval = html.indexOf("<h3>GDPval-AA v2</h3>");
  assert.ok(intelligence >= 0);
  assert.ok(coding > intelligence);
  assert.ok(gdpval > coding);
});

test("ships collision-aware labels, adaptive tooltips, and refreshed FrontierCode data", async () => {
  const [component, css, packageJson, datasetText] = await Promise.all([
    readFile(new URL("../app/benchmark-explorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/data/benchmark-data.json", import.meta.url), "utf8"),
  ]);
  const dataset = JSON.parse(datasetText);

  assert.match(component, /from "d3-force"/);
  assert.match(component, /createParetoLabelLayout/);
  assert.match(component, /chooseTooltipPlacement/);
  assert.match(packageJson, /"d3-force":/);
  assert.match(
    css,
    /\.site-header\s*\{[^}]*position:\s*relative/s,
  );
  assert.match(
    css,
    /\.chart-toolbar\s*\{[^}]*position:\s*sticky/s,
  );

  const frontierNames = new Set(
    dataset.models
      .filter((model) => model.id.startsWith("frontier-code:"))
      .map((model) => model.baseName),
  );
  for (const model of ["Grok 4.5", "SWE-1.7", "Kimi K2.7", "Composer 2.5"]) {
    assert.ok(frontierNames.has(model), `${model} is missing from FrontierCode`);
  }
  assert.ok(
    dataset.models.filter((model) => Number.isFinite(model.parameters)).length >= 374,
  );
  assert.match(css, /\.chart-better-zone\s*\{[^}]*width:\s*25%[^}]*height:\s*25%/s);
});
