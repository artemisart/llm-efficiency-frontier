import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

function pagesBasePath() {
  if (process.env.PAGES_BASE_PATH !== undefined) return process.env.PAGES_BASE_PATH;

  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  return process.env.GITHUB_ACTIONS === "true" &&
    repositoryName &&
    !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}`
    : "";
}

test("static export contains the complete benchmark gallery in the intended order", async () => {
  const html = await render();
  assert.match(html, /<title>LLM Efficiency Frontier/);
  assert.match(html, /class="chart-toolbar"/);
  assert.match(html, /class="multi-select-control"/);
  assert.match(html, />Filter</);
  assert.match(html, />Highlight</);
  assert.match(html, /type="range"/);
  assert.match(html, /LLM Efficiency Frontier/);
  assert.doesNotMatch(html, />AI21 Labs</);
  assert.match(html, />Performance →</);
  assert.doesNotMatch(html, />Performance vs\. cost</);
  assert.doesNotMatch(html, />Weighted average cost per Intelligence Index task\.</);
  assert.ok(
    html.includes(
      `href="${pagesBasePath()}/data/artificial-analysis-full.json"`,
    ),
  );
  assert.doesNotMatch(html, /sites\.openai\.com/);

  const intelligence = html.indexOf("<h3>Intelligence Index</h3>");
  const coding = html.indexOf("<h3>AA Coding Agent Index v1.3</h3>");
  const gdpval = html.indexOf("<h3>GDPval-AA v2</h3>");
  assert.ok(intelligence >= 0);
  assert.ok(coding > intelligence);
  assert.ok(gdpval > coding);
});

test("ships collision-aware frontier labels, point info, and refreshed FrontierCode data", async () => {
  const [component, css, packageJson, datasetText] = await Promise.all([
    readFile(new URL("../app/benchmark-explorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/data/benchmark-data.json", import.meta.url), "utf8"),
  ]);
  const dataset = JSON.parse(datasetText);

  assert.match(component, /from "d3-force"/);
  assert.match(component, /createParetoLabelLayout/);
  assert.match(component, /className="point-info"/);
  assert.match(component, /isPlottableValue/);
  assert.match(component, /className=\{`effort-level-label/);
  assert.match(component, /labIdentity/);
  assert.match(component, /matchesModelQuery/);
  assert.doesNotMatch(component, /chooseTooltipPlacement/);
  assert.doesNotMatch(component, /className="site-header"/);
  assert.match(packageJson, /"d3-force":/);
  assert.doesNotMatch(css, /\.site-header\s*\{/);
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
  assert.match(css, /\.point-info\s*\{/);
  assert.match(css, /\.size-range-selection\s*\{/);
  assert.match(css, /\.highlight-control\s*\{/);
  assert.doesNotMatch(css, /\.cost-scale-toggle > i\s*\{/);
  assert.doesNotMatch(css, /\.tooltip\s*\{/);
});
