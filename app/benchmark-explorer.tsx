"use client";

import { useMemo, useState } from "react";
import sourceData from "./data/benchmark-data.json";

type BenchmarkValue = {
  score: number;
  cost: number;
};

type Model = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  releaseDate: string | null;
  deprecated: boolean;
  reasoning: boolean;
  openWeights: boolean;
  creator: {
    id: string;
    slug: string;
    name: string;
    color: string;
    country: string | null;
  };
  benchmarks: Record<string, BenchmarkValue>;
};

type Benchmark = {
  id: string;
  label: string;
  shortLabel: string;
  scoreSuffix: string;
  description: string;
  costNote: string;
  modelsWithData: number;
};

type DataShape = {
  meta: {
    source: string;
    extractedAt: string;
    modelCount: number;
    endpointCount: number;
    graphDatasetCount: number;
    citation: string;
    license: string;
  };
  benchmarks: Benchmark[];
  models: Model[];
};

type SortMode = "efficiency" | "performance" | "cost";

const data = sourceData as DataShape;

function money(value: number) {
  if (value < 0.001) return `$${value.toFixed(5)}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function score(value: number, suffix: string) {
  const precision = Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(precision)}${suffix}`;
}

function compactMoney(value: number) {
  if (value >= 1) return `$${value.toFixed(value >= 10 ? 0 : 1)}`;
  if (value >= 0.1) return `$${value.toFixed(1)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(1)}`;
}

function computePareto(models: Model[], benchmarkId: string) {
  const sorted = [...models].sort(
    (left, right) =>
      left.benchmarks[benchmarkId].cost - right.benchmarks[benchmarkId].cost ||
      right.benchmarks[benchmarkId].score - left.benchmarks[benchmarkId].score,
  );
  const frontier = new Set<string>();
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const model of sorted) {
    const value = model.benchmarks[benchmarkId];
    if (value.score > bestScore) {
      frontier.add(model.id);
      bestScore = value.score;
    }
  }
  return frontier;
}

function efficiencyScores(models: Model[], benchmarkId: string) {
  const byPerformance = [...models].sort(
    (left, right) =>
      left.benchmarks[benchmarkId].score - right.benchmarks[benchmarkId].score,
  );
  const byCost = [...models].sort(
    (left, right) =>
      right.benchmarks[benchmarkId].cost - left.benchmarks[benchmarkId].cost,
  );
  const performanceRank = new Map(
    byPerformance.map((model, index) => [model.id, index / Math.max(1, models.length - 1)]),
  );
  const costRank = new Map(
    byCost.map((model, index) => [model.id, index / Math.max(1, models.length - 1)]),
  );
  return new Map(
    models.map((model) => [
      model.id,
      ((performanceRank.get(model.id) ?? 0) + (costRank.get(model.id) ?? 0)) / 2,
    ]),
  );
}

export function BenchmarkExplorer() {
  const [benchmarkId, setBenchmarkId] = useState(data.benchmarks[0].id);
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("all");
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [linearCost, setLinearCost] = useState(false);
  const [labels, setLabels] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("efficiency");
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const benchmark = data.benchmarks.find((item) => item.id === benchmarkId)!;
  const creators = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const model of data.models) {
      if (model.benchmarks[benchmarkId]) {
        map.set(model.creator.slug, {
          slug: model.creator.slug,
          name: model.creator.name,
        });
      }
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [benchmarkId]);

  const plotted = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.models.filter((model) => {
      if (!model.benchmarks[benchmarkId]) return false;
      if (!includeDeprecated && model.deprecated) return false;
      if (creator !== "all" && model.creator.slug !== creator) return false;
      if (reasoningOnly && !model.reasoning) return false;
      if (openWeightsOnly && !model.openWeights) return false;
      if (
        normalizedQuery &&
        !`${model.name} ${model.shortName} ${model.creator.name}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [
    benchmarkId,
    creator,
    includeDeprecated,
    openWeightsOnly,
    query,
    reasoningOnly,
  ]);

  const view = useMemo(() => {
    const values = plotted.map((model) => model.benchmarks[benchmarkId]);
    const costs = values.map((value) => value.cost);
    const scores = values.map((value) => value.score);
    const costMin = Math.min(...costs);
    const costMax = Math.max(...costs);
    const scoreMin = Math.min(...scores);
    const scoreMax = Math.max(...scores);
    const xMin = linearCost ? costMin : Math.log10(costMin);
    const xMax = linearCost ? costMax : Math.log10(costMax);
    const yPadding = Math.max((scoreMax - scoreMin) * 0.09, 1);

    return {
      costMin,
      costMax,
      scoreMin: scoreMin - yPadding,
      scoreMax: scoreMax + yPadding,
      xMin,
      xMax,
      x(model: Model) {
        const cost = model.benchmarks[benchmarkId].cost;
        const position = linearCost ? cost : Math.log10(cost);
        return ((position - xMin) / Math.max(xMax - xMin, 0.00001)) * 100;
      },
      y(model: Model) {
        const value = model.benchmarks[benchmarkId].score;
        return (
          100 -
          ((value - (scoreMin - yPadding)) /
            Math.max(scoreMax + yPadding - (scoreMin - yPadding), 0.00001)) *
            100
        );
      },
    };
  }, [benchmarkId, linearCost, plotted]);

  const pareto = useMemo(() => computePareto(plotted, benchmarkId), [benchmarkId, plotted]);
  const efficiencies = useMemo(
    () => efficiencyScores(plotted, benchmarkId),
    [benchmarkId, plotted],
  );

  const ranked = useMemo(() => {
    return [...plotted].sort((left, right) => {
      const leftValue = left.benchmarks[benchmarkId];
      const rightValue = right.benchmarks[benchmarkId];
      if (sortMode === "performance") return rightValue.score - leftValue.score;
      if (sortMode === "cost") return leftValue.cost - rightValue.cost;
      return (efficiencies.get(right.id) ?? 0) - (efficiencies.get(left.id) ?? 0);
    });
  }, [benchmarkId, efficiencies, plotted, sortMode]);

  const highlights = useMemo(() => {
    if (!plotted.length) return null;
    const best = [...plotted].sort(
      (left, right) =>
        right.benchmarks[benchmarkId].score - left.benchmarks[benchmarkId].score,
    )[0];
    const cheapest = [...plotted].sort(
      (left, right) =>
        left.benchmarks[benchmarkId].cost - right.benchmarks[benchmarkId].cost,
    )[0];
    const target = best.benchmarks[benchmarkId].score * 0.9;
    const valuePick = [...plotted]
      .filter((model) => model.benchmarks[benchmarkId].score >= target)
      .sort(
        (left, right) =>
          left.benchmarks[benchmarkId].cost - right.benchmarks[benchmarkId].cost,
      )[0];
    return { best, cheapest, valuePick };
  }, [benchmarkId, plotted]);

  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const axisValue = view.xMin + (view.xMax - view.xMin) * ratio;
    const cost = linearCost ? axisValue : 10 ** axisValue;
    return { position: ratio * 100, label: compactMoney(cost) };
  });
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      position: ratio * 100,
      label: score(view.scoreMax - (view.scoreMax - view.scoreMin) * ratio, benchmark.scoreSuffix),
    };
  });

  function resetFilters() {
    setQuery("");
    setCreator("all");
    setReasoningOnly(false);
    setOpenWeightsOnly(false);
    setIncludeDeprecated(true);
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Model Economics home">
          <span>ME</span>
          <strong>Model Economics</strong>
        </a>
        <nav aria-label="Page navigation">
          <a href="#explorer">Explorer</a>
          <a href="#table">Models</a>
          <a href="#method">Method</a>
        </nav>
        <a
          className="header-source"
          href="https://artificialanalysis.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Data: Artificial Analysis ↗
        </a>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className="live-dot" />
          Snapshot extracted {new Date(data.meta.extractedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        <h1>
          The price of
          <br />
          <em>performance.</em>
        </h1>
        <p className="hero-copy">
          Every evaluated model, unpacked benchmark by benchmark. Move left for lower
          cost. Move up for better performance.
        </p>
        <div className="hero-stats" aria-label="Dataset summary">
          <div>
            <strong>{data.meta.modelCount}</strong>
            <span>Model records</span>
          </div>
          <div>
            <strong>{data.meta.endpointCount}</strong>
            <span>Provider endpoints</span>
          </div>
          <div>
            <strong>{data.benchmarks.length}</strong>
            <span>Cost-matched benchmarks</span>
          </div>
        </div>
      </section>

      <section className="explorer-section" id="explorer">
        <div className="section-kicker">
          <span>01</span>
          Benchmark explorer
        </div>
        <div className="benchmark-tabs" role="tablist" aria-label="Benchmarks">
          {data.benchmarks.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === benchmarkId}
              className={item.id === benchmarkId ? "active" : ""}
              onClick={() => {
                setBenchmarkId(item.id);
                setActiveModel(null);
                setCreator("all");
              }}
            >
              {item.shortLabel}
              <span>{item.modelsWithData}</span>
            </button>
          ))}
        </div>

        <div className="controls">
          <label className="search-control">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Model or lab"
            />
          </label>
          <label>
            <span>Lab</span>
            <select value={creator} onChange={(event) => setCreator(event.target.value)}>
              <option value="all">All labs</option>
              {creators.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={reasoningOnly}
              onChange={(event) => setReasoningOnly(event.target.checked)}
            />
            <span>Reasoning only</span>
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={openWeightsOnly}
              onChange={(event) => setOpenWeightsOnly(event.target.checked)}
            />
            <span>Open weights</span>
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={includeDeprecated}
              onChange={(event) => setIncludeDeprecated(event.target.checked)}
            />
            <span>Include legacy</span>
          </label>
          <button type="button" className="reset-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="chart-grid">
          <article className="chart-card">
            <div className="chart-heading">
              <div>
                <p>Performance vs. weighted task cost</p>
                <h2>{benchmark.label}</h2>
              </div>
              <div className="chart-toggles">
                <button
                  type="button"
                  className={linearCost ? "" : "active"}
                  onClick={() => setLinearCost(false)}
                >
                  Log cost
                </button>
                <button
                  type="button"
                  className={linearCost ? "active" : ""}
                  onClick={() => setLinearCost(true)}
                >
                  Linear
                </button>
                <button
                  type="button"
                  className={labels ? "active" : ""}
                  onClick={() => setLabels((value) => !value)}
                >
                  Labels
                </button>
              </div>
            </div>

            {plotted.length ? (
              <div className="plot-shell">
                <span className="y-axis-title">Performance ↑</span>
                <div className="y-ticks" aria-hidden="true">
                  {yTicks.map((tick) => (
                    <span key={tick.position} style={{ top: `${tick.position}%` }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
                <div className="plot-area" onMouseLeave={() => setActiveModel(null)}>
                  {xTicks.map((tick) => (
                    <i
                      key={`x-${tick.position}`}
                      className="grid-line vertical"
                      style={{ left: `${tick.position}%` }}
                    />
                  ))}
                  {yTicks.map((tick) => (
                    <i
                      key={`y-${tick.position}`}
                      className="grid-line horizontal"
                      style={{ top: `${tick.position}%` }}
                    />
                  ))}
                  {plotted.map((model) => {
                    const x = view.x(model);
                    const y = view.y(model);
                    const value = model.benchmarks[benchmarkId];
                    const isActive = activeModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={`point ${pareto.has(model.id) ? "pareto" : ""} ${
                          isActive ? "selected" : ""
                        }`}
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          backgroundColor: model.creator.color,
                        }}
                        aria-label={`${model.name}: ${score(
                          value.score,
                          benchmark.scoreSuffix,
                        )} at ${money(value.cost)} per task`}
                        onMouseEnter={() => setActiveModel(model.id)}
                        onFocus={() => setActiveModel(model.id)}
                        onBlur={() => setActiveModel(null)}
                      >
                        {labels && (
                          <span
                            className={`point-label ${x > 74 ? "align-right" : ""}`}
                          >
                            {model.shortName}
                          </span>
                        )}
                        {isActive && (
                          <span
                            className={`tooltip ${x < 18 ? "edge-left" : ""} ${
                              x > 82 ? "edge-right" : ""
                            }`}
                          >
                            <strong>{model.name}</strong>
                            <small>{model.creator.name}</small>
                            <b>{score(value.score, benchmark.scoreSuffix)}</b>
                            <em>{money(value.cost)} / task</em>
                            {pareto.has(model.id) && <mark>Pareto efficient</mark>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="x-ticks" aria-hidden="true">
                  {xTicks.map((tick) => (
                    <span key={tick.position} style={{ left: `${tick.position}%` }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
                <span className="x-axis-title">Weighted cost per task (USD) →</span>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No matching models</strong>
                <span>Clear a filter to bring the model field back into view.</span>
                <button type="button" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            )}

            <div className="chart-legend">
              <span>
                <i className="legend-dot pareto-dot" /> Pareto frontier
              </span>
              <span>
                <i className="legend-dot" /> Other evaluated model
              </span>
              <strong>
                {plotted.length} of {benchmark.modelsWithData} plotted
              </strong>
            </div>
          </article>

          <aside className="insights-card">
            <p className="aside-label">Reading the field</p>
            <h3>{benchmark.label}</h3>
            <p>{benchmark.description}</p>
            <div className="attractive-region">
              <span>Attractive region</span>
              <strong>UP + LEFT ↖</strong>
              <small>Better scores, lower spend</small>
            </div>
            {highlights && (
              <div className="highlights">
                {[
                  ["Highest score", highlights.best],
                  ["Lowest cost", highlights.cheapest],
                  ["90% value pick", highlights.valuePick],
                ].map(([label, model]) => {
                  const selected = model as Model;
                  const value = selected.benchmarks[benchmarkId];
                  return (
                    <button
                      key={label as string}
                      type="button"
                      onMouseEnter={() => setActiveModel(selected.id)}
                      onFocus={() => setActiveModel(selected.id)}
                      onBlur={() => setActiveModel(null)}
                    >
                      <span>{label as string}</span>
                      <strong>{selected.shortName}</strong>
                      <small>
                        {score(value.score, benchmark.scoreSuffix)} · {money(value.cost)}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="cost-note">{benchmark.costNote}</p>
          </aside>
        </div>
      </section>

      <section className="table-section" id="table">
        <div className="table-title-row">
          <div>
            <div className="section-kicker">
              <span>02</span>
              Model ledger
            </div>
            <h2>Every plotted model.</h2>
          </div>
          <div className="sort-controls">
            <span>Sort</span>
            {(["efficiency", "performance", "cost"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={sortMode === mode ? "active" : ""}
                onClick={() => setSortMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="model-table" role="table" aria-label={`${benchmark.label} models`}>
          <div className="model-row table-head" role="row">
            <span>#</span>
            <span>Model</span>
            <span>Lab</span>
            <span>Performance</span>
            <span>Cost / task</span>
            <span>Position</span>
          </div>
          {ranked.map((model, index) => {
            const value = model.benchmarks[benchmarkId];
            return (
              <a
                className="model-row"
                role="row"
                key={model.id}
                href={`https://artificialanalysis.ai/models/${model.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <i style={{ backgroundColor: model.creator.color }} />
                  <strong>{model.name}</strong>
                  {model.reasoning && <small>R</small>}
                  {model.openWeights && <small>OW</small>}
                </span>
                <span>{model.creator.name}</span>
                <span>{score(value.score, benchmark.scoreSuffix)}</span>
                <span>{money(value.cost)}</span>
                <span className={pareto.has(model.id) ? "frontier-status" : ""}>
                  {pareto.has(model.id) ? "Frontier" : "Field"}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="section-kicker light">
          <span>03</span>
          Data & method
        </div>
        <div className="method-grid">
          <div>
            <h2>Direct from the graph payload.</h2>
            <p>
              The snapshot follows Artificial Analysis’s own homepage request manifest,
              decrypts the public all-model payload with the same browser-side method,
              and pairs each benchmark score with its corresponding weighted cost-per-task
              value.
            </p>
          </div>
          <div>
            <h3>What “cost” means</h3>
            <p>
              For each of the nine component evaluations, the x-axis uses
              <code> weightedCostPerTask</code>. The aggregate tab uses the total weighted
              average cost per Intelligence Index task.
            </p>
          </div>
          <div>
            <h3>Coverage</h3>
            <p>
              All {data.meta.modelCount} model records and {data.meta.endpointCount} provider
              variants are retained in the downloadable snapshot. A point appears only where
              both a score and positive task cost exist.
            </p>
          </div>
          <div className="download-panel">
            <span>Full extracted snapshot</span>
            <strong>Models, endpoints & 21 rendered graphs</strong>
            <a href="/data/artificial-analysis-full.json" download>
              Download JSON ↓
            </a>
          </div>
        </div>
        <div className="source-strip">
          <span>{data.meta.citation}</span>
          <a href={data.meta.license} target="_blank" rel="noreferrer">
            Source terms ↗
          </a>
          <a href={data.meta.source} target="_blank" rel="noreferrer">
            Artificial Analysis ↗
          </a>
        </div>
      </section>
    </main>
  );
}
