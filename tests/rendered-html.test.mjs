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
  assert.match(html, /aria-label="Reset model size filter"/);
  assert.match(html, /LLM Efficiency Frontier/);
  assert.match(html, />Performance →</);
  assert.doesNotMatch(html, />Performance vs\. cost</);
  assert.doesNotMatch(html, />Weighted average cost per Intelligence Index task\.</);
  assert.ok(
    html.includes(
      `href="${pagesBasePath()}/data/artificial-analysis-full.json"`,
    ),
  );
  assert.doesNotMatch(html, /sites\.openai\.com/);
  const dataset = JSON.parse(await readFile(new URL("../app/data/benchmark-data.json", import.meta.url), "utf8"));
  assert.ok(html.includes(`content="${dataset.benchmarks.length} benchmarks · ${dataset.meta.sourceCount} sources · performance × cost"`));
  // AI21 now has plottable standalone scores; it was previously excluded
  // because it had no score/cost pairs, not because the lab is unsupported.
  assert.equal(html.includes(">AI21 Labs<"), dataset.models.some((model) => model.creator.name === "AI21 Labs"));
  for (const benchmark of dataset.benchmarks.filter((item) => item.historical)) {
    assert.ok(html.includes(benchmark.refreshNote));
    assert.ok(html.includes(benchmark.refreshedAt.slice(0, 10)));
  }

  for (const benchmark of dataset.benchmarks.filter((item) => item.pricingNote)) {
    assert.ok(html.includes(benchmark.pricingNote));
  }

  for (const label of ["AA-Briefcase v1.1", "AutomationBench-AA", "Terminal-Bench 4.0 — AA models", "GDP.pdf", "AA-LCR v1.1", "LiveBench 2.0 (2026-10-14)",
    "Terminal-Bench-Science 0.1 — AA", "AA-AnalystAgent", "Harvey LAB-AA v1.1", "EnterpriseOps-Gym-AA", "ITBench-AA", "MLCR-AA", "MMMU-Pro", "FrontierCode 1.1 Main — AA",
    "Terminal-Bench 4.0 — official", "Terminal-Bench 2.1 — official", "Terminal-Bench-Science 0.1 — official"]) {
    assert.ok(html.includes(`<h3>${label}</h3>`), `${label} is missing from the gallery`);
  }

  const intelligence = html.indexOf("<h3>Intelligence Index</h3>");
  const coding = html.search(/<h3>AA Coding Agent Index v[0-9.]+<\/h3>/);
  const gdpval = html.indexOf("<h3>GDPval-AA v2.1</h3>");
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

  assert.match(component, /createParetoLabelLayout/);
  assert.match(component, /className="pareto-label-links"/);
  assert.match(component, /labelOverlap \* 1000/);
  assert.match(component, /anchorCovered \? 100_000_000/);
  assert.match(component, /className="point-info"/);
  assert.match(component, /isPlottableValue/);
  assert.match(component, /className=\{`effort-level-label/);
  assert.match(component, /labIdentity/);
  assert.match(component, /matchesModelQuery/);
  assert.match(component, /const resetModelSize = useCallback/);
  assert.match(component, /onClick=\{resetModelSize\}/);
  assert.match(component, /const MODEL_SIZE_MIN = Math\.min/);
  assert.doesNotMatch(component, /const MODEL_SIZE_MIN = 0\.1/);
  assert.doesNotMatch(component, /chooseTooltipPlacement/);
  assert.doesNotMatch(component, /className="site-header"/);
  assert.doesNotMatch(packageJson, /"d3-force":/);
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
    dataset.models.filter((model) => Number.isFinite(model.parameters)).length >= 70,
  );
  assert.ok(dataset.meta.sourceModelCount > dataset.meta.modelCount);
  assert.equal(
    dataset.meta.modelCount,
    dataset.models.filter(
      (model) =>
        !/^(?:coding-index|deep-swe|frontier-code|livebench|terminal-bench):/.test(model.id),
    ).length,
  );
  assert.ok(
    dataset.models.every((model) =>
      Object.values(model.benchmarks).some(
        (value) =>
          Number.isFinite(value.score) &&
          Number.isFinite(value.cost) && value.cost > 0,
      ),
    ),
  );
  assert.match(css, /\.chart-better-zone\s*\{[^}]*width:\s*25%[^}]*height:\s*25%/s);
  assert.match(css, /\.point-info\s*\{/);
  assert.match(css, /\.size-range-selection\s*\{/);
  assert.match(css, /\.highlight-control\s*\{/);
  assert.doesNotMatch(css, /\.cost-scale-toggle > i\s*\{/);
  assert.doesNotMatch(css, /\.tooltip\s*\{/);
});

test("gallery excludes AA agent components without published task costs", async () => {
  const html = await render();
  const dataset = JSON.parse(await readFile(new URL("../app/data/benchmark-data.json", import.meta.url), "utf8"));
  assert.equal(dataset.benchmarks.length, 30);
  assert.ok(dataset.benchmarks.every((benchmark) => !benchmark.id.startsWith("aa-agents-")));
  assert.doesNotMatch(html, /score-ranking|score-only-card/);
  for (const label of ["Terminal-Bench 4.0 — AA agents", "DeepSWE v1.1 — AA agents", "SWE-Atlas-QnA — AA agents"]) assert.ok(!html.includes(`<h3>${label}</h3>`));
  for (const label of ["Terminal-Bench 4.0 — AA models", "Terminal-Bench 4.0 — official", "DeepSWE v1.1 — Datacurve"]) assert.ok(html.includes(`<h3>${label}</h3>`));
});
