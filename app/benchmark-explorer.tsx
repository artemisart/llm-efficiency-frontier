"use client";

import { useEffect, useMemo, useState } from "react";
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
  costAxisLabel: string;
  sourceUrl: string;
  sourceLabel: string;
  modelsWithData: number;
};

type DataShape = {
  meta: {
    source: string;
    extractedAt: string;
    modelCount: number;
    endpointCount: number;
    graphDatasetCount: number;
    externalModelCount: number;
    sourceCount: number;
    citation: string;
    license: string;
  };
  benchmarks: Benchmark[];
  models: Model[];
};

type ChartProps = {
  benchmark: Benchmark;
  models: Model[];
  featured: boolean;
  linearCost: boolean;
  labels: boolean;
  activePoint: string | null;
  setActivePoint: (value: string | null) => void;
  resetFilters: () => void;
};

const data = sourceData as DataShape;
const EFFORT_RANK: Record<string, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};
const THEMES = [
  {
    id: "analytical",
    name: "Analytical Studio",
    note: "Calm research tool",
  },
  {
    id: "observatory",
    name: "Dark Observatory",
    note: "Technical and focused",
  },
  {
    id: "scientific",
    name: "Scientific Paper",
    note: "Academic and restrained",
  },
  {
    id: "atlas",
    name: "Data Atlas",
    note: "Visual and approachable",
  },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

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

function roundPosition(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function effortIdentity(model: Model) {
  const settings = model.name.match(/\(([^()]*)\)\s*$/);
  if (!settings) return null;
  const effort = settings[1].match(/\b(minimal|low|medium|xhigh|high|max)\s*(?:effort)?\b/i);
  if (!effort) return null;
  return {
    key: `${model.creator.slug}:${model.name
      .slice(0, settings.index ?? model.name.length)
      .trim()
      .toLowerCase()}`,
    rank: EFFORT_RANK[effort[1].toLowerCase()],
  };
}

function createChartView(models: Model[], benchmarkId: string, linearCost: boolean) {
  const values = models.map((model) => model.benchmarks[benchmarkId]);
  if (!values.length) {
    return {
      scoreMin: 0,
      scoreMax: 1,
      xMin: 0,
      xMax: 1,
      x: (_model: Model) => 0,
      y: (_model: Model) => 0,
    };
  }

  const costs = values.map((value) => value.cost);
  const scores = values.map((value) => value.score);
  const costMin = Math.min(...costs);
  const costMax = Math.max(...costs);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);
  const xMin = linearCost ? costMin : Math.log10(costMin);
  const xMax = linearCost ? costMax : Math.log10(costMax);
  const yPadding = Math.max((scoreMax - scoreMin) * 0.09, 1);
  const yMin = Math.max(0, scoreMin - yPadding);
  const yMax = scoreMax + yPadding;

  return {
    scoreMin: yMin,
    scoreMax: yMax,
    xMin,
    xMax,
    x(model: Model) {
      const cost = model.benchmarks[benchmarkId].cost;
      const position = linearCost ? cost : Math.log10(cost);
      return roundPosition(
        ((position - xMin) / Math.max(xMax - xMin, 0.00001)) * 100,
      );
    },
    y(model: Model) {
      const value = model.benchmarks[benchmarkId].score;
      return roundPosition(
        100 - ((value - yMin) / Math.max(yMax - yMin, 0.00001)) * 100,
      );
    },
  };
}

function createEffortLinks(
  models: Model[],
  benchmarkId: string,
  view: ReturnType<typeof createChartView>,
) {
  const groups = new Map<string, Array<{ model: Model; rank: number }>>();
  for (const model of models) {
    const identity = effortIdentity(model);
    if (!identity) continue;
    const group = groups.get(identity.key) ?? [];
    group.push({ model, rank: identity.rank });
    groups.set(identity.key, group);
  }

  return [...groups.entries()].flatMap(([key, group]) => {
    if (group.length < 2) return [];
    const ordered = group.sort(
      (left, right) =>
        left.rank - right.rank ||
        left.model.benchmarks[benchmarkId].cost -
          right.model.benchmarks[benchmarkId].cost,
    );
    return ordered.slice(1).map((current, index) => {
      const previous = ordered[index];
      return {
        key: `${key}:${previous.model.id}:${current.model.id}`,
        groupKey: key,
        x1: view.x(previous.model),
        y1: view.y(previous.model),
        x2: view.x(current.model),
        y2: view.y(current.model),
      };
    });
  });
}

function BenchmarkChart({
  benchmark,
  models,
  featured,
  linearCost,
  labels,
  activePoint,
  setActivePoint,
  resetFilters,
}: ChartProps) {
  const plotted = models.filter((model) => model.benchmarks[benchmark.id]);
  const view = createChartView(plotted, benchmark.id, linearCost);
  const effortLinks = createEffortLinks(plotted, benchmark.id, view);
  const activeModel = plotted.find(
    (model) => activePoint === `${benchmark.id}:${model.id}`,
  );
  const activeEffortKey = activeModel ? effortIdentity(activeModel)?.key : null;
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
      label: score(
        view.scoreMax - (view.scoreMax - view.scoreMin) * ratio,
        benchmark.scoreSuffix,
      ),
    };
  });

  return (
    <article className={`gallery-card ${featured ? "featured" : ""}`}>
      <div className="gallery-card-heading">
        <div>
          <p>Performance vs. cost</p>
          <h3>{benchmark.label}</h3>
        </div>
        <a
          className="benchmark-source"
          href={benchmark.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {benchmark.sourceLabel} ↗
        </a>
      </div>
      <p className="gallery-card-description">{benchmark.description}</p>

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
          <div
            className="plot-area"
            onMouseLeave={() => setActivePoint(null)}
            onClick={() => setActivePoint(null)}
          >
            <div className="chart-better-zone" aria-hidden="true">
              <span>Better ↖</span>
            </div>
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
            <svg
              className="effort-links"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {effortLinks.map((link) => (
                <line
                  key={link.key}
                  className={link.groupKey === activeEffortKey ? "active" : ""}
                  x1={link.x1}
                  y1={link.y1}
                  x2={link.x2}
                  y2={link.y2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {plotted.map((model) => {
              const x = view.x(model);
              const y = view.y(model);
              const value = model.benchmarks[benchmark.id];
              const pointId = `${benchmark.id}:${model.id}`;
              const isActive = activePoint === pointId;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`point ${isActive ? "selected" : ""}`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    backgroundColor: model.creator.color,
                  }}
                  aria-label={`${model.name}: ${score(
                    value.score,
                    benchmark.scoreSuffix,
                  )} at ${money(value.cost)} per task`}
                  onMouseEnter={() => setActivePoint(pointId)}
                  onFocus={() => setActivePoint(pointId)}
                  onBlur={() => setActivePoint(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActivePoint(pointId);
                  }}
                >
                  {labels && (
                    <span className={`point-label ${x > 74 ? "align-right" : ""}`}>
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
          <span className="x-axis-title">{benchmark.costAxisLabel} →</span>
        </div>
      ) : (
        <div className="empty-state">
          <strong>No matching models</strong>
          <span>Clear a filter to bring this benchmark back into view.</span>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}

      <div className="gallery-card-footer">
        <span>{benchmark.costNote}</span>
        <strong>{plotted.length} plotted</strong>
      </div>
    </article>
  );
}

export function BenchmarkExplorer() {
  const [theme, setTheme] = useState<ThemeId>("analytical");
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("all");
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [linearCost, setLinearCost] = useState(false);
  const [labels, setLabels] = useState(false);
  const [activePoint, setActivePoint] = useState<string | null>(null);

  useEffect(() => {
    const queryTheme = new URLSearchParams(window.location.search).get("theme");
    const savedTheme = window.localStorage.getItem("model-economics-theme");
    const preferredTheme = isThemeId(queryTheme)
      ? queryTheme
      : isThemeId(savedTheme)
        ? savedTheme
        : "analytical";
    setTheme(preferredTheme);
  }, []);

  function selectTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    window.localStorage.setItem("model-economics-theme", nextTheme);
    const url = new URL(window.location.href);
    url.searchParams.set("theme", nextTheme);
    window.history.replaceState({}, "", url);
  }

  const creators = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const model of data.models) {
      map.set(model.creator.slug, {
        slug: model.creator.slug,
        name: model.creator.name,
      });
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, []);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.models.filter((model) => {
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
  }, [creator, includeDeprecated, openWeightsOnly, query, reasoningOnly]);

  function resetFilters() {
    setQuery("");
    setCreator("all");
    setReasoningOnly(false);
    setOpenWeightsOnly(false);
    setIncludeDeprecated(true);
    setActivePoint(null);
  }

  return (
    <main data-theme={theme}>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Model Economics home">
          <span>ME</span>
          <strong>Model Economics</strong>
        </a>
        <nav aria-label="Page navigation">
          <a href="#explorer">Explorer</a>
          <a href="#method">Method</a>
        </nav>
        <a
          className="header-source"
          href="#method"
        >
          Data: {data.meta.sourceCount} published sources ↓
        </a>
      </header>

      <section className="theme-lab" aria-label="Compare visual themes">
        <div className="theme-lab-label">
          <span>Theme lab</span>
          <small>Compare four directions</small>
        </div>
        <div className="theme-options" role="group" aria-label="Visual theme">
          {THEMES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={theme === item.id ? "active" : ""}
              aria-pressed={theme === item.id}
              onClick={() => selectTheme(item.id)}
            >
              <i>{String(index + 1).padStart(2, "0")}</i>
              <span>{item.name}</span>
              <small>{item.note}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className="live-dot" />
          Data refreshed {new Date(data.meta.extractedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        <h1 aria-label="The price of performance.">
          <span>The price of</span>
          <em>performance.</em>
        </h1>
        <p className="hero-copy">
          Every evaluated model, unpacked benchmark by benchmark. Move left for lower
          cost. Move up for better performance.
        </p>
      </section>

      <section className="explorer-section" id="explorer">
        <div className="section-kicker">
          <span>01</span>
          Intelligence breakdown
        </div>

        <div className="gallery-heading">
          <div>
            <h2>Every benchmark.<br />One field of view.</h2>
            <p>
              Artificial Analysis’s Intelligence Index leads, followed by its component
              evaluations and three independent software and general-purpose benchmarks.
              Filters and cost scale apply to the complete gallery.
            </p>
          </div>
          <div className="chart-toggles" aria-label="Chart view">
            <button
              type="button"
              className={linearCost ? "" : "active"}
              onClick={() => {
                setLinearCost(false);
                setActivePoint(null);
              }}
            >
              Log cost
            </button>
            <button
              type="button"
              className={linearCost ? "active" : ""}
              onClick={() => {
                setLinearCost(true);
                setActivePoint(null);
              }}
            >
              Linear
            </button>
            <button
              type="button"
              className={labels ? "active" : ""}
              onClick={() => {
                setLabels((value) => !value);
                setActivePoint(null);
              }}
            >
              Labels
            </button>
          </div>
        </div>

        <div className="controls">
          <label className="search-control">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActivePoint(null);
              }}
              placeholder="Model or lab"
            />
          </label>
          <label>
            <span>Lab</span>
            <select
              value={creator}
              onChange={(event) => {
                setCreator(event.target.value);
                setActivePoint(null);
              }}
            >
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
              onChange={(event) => {
                setReasoningOnly(event.target.checked);
                setActivePoint(null);
              }}
            />
            <span>Reasoning only</span>
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={openWeightsOnly}
              onChange={(event) => {
                setOpenWeightsOnly(event.target.checked);
                setActivePoint(null);
              }}
            />
            <span>Open weights only</span>
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={includeDeprecated}
              onChange={(event) => {
                setIncludeDeprecated(event.target.checked);
                setActivePoint(null);
              }}
            />
            <span>Include older models</span>
          </label>
          <button type="button" className="reset-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="gallery-key" aria-label="Chart legend">
          <span>
            <i className="legend-dot" /> Evaluated model
          </span>
          <span>
            <i className="legend-link" /> Same model, different effort
          </span>
          <strong>{filteredModels.length} matching model records</strong>
        </div>

        <div className="chart-gallery">
          {data.benchmarks.map((benchmark, index) => (
            <BenchmarkChart
              key={benchmark.id}
              benchmark={benchmark}
              models={filteredModels}
              featured={index === 0}
              linearCost={linearCost}
              labels={labels}
              activePoint={activePoint}
              setActivePoint={setActivePoint}
              resetFilters={resetFilters}
            />
          ))}
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="section-kicker light">
          <span>02</span>
          Data & method
        </div>
        <div className="method-grid">
          <div>
            <h2>Direct from published benchmark data.</h2>
            <p>
              Artificial Analysis values come from its public graph payload. FrontierCode,
              DeepSWE, and LiveBench are loaded from their official machine-readable
              releases, preserving each source’s own score and measured cost definition.
            </p>
          </div>
          <div>
            <h3>What “cost” means</h3>
            <p>
              Artificial Analysis uses <code> weightedCostPerTask</code>. FrontierCode
              reports average task cost, DeepSWE mean rollout cost, and LiveBench cost per
              successful task. Axis labels and card notes make those differences explicit.
            </p>
          </div>
          <div>
            <h3>Coverage</h3>
            <p>
              All {data.meta.modelCount} model records and {data.meta.endpointCount} provider
              variants from Artificial Analysis are retained, alongside{" "}
              {data.meta.externalModelCount} current configurations from the three additional
              sources. A point appears only where both a score and positive task cost exist.
            </p>
          </div>
          <div className="download-panel">
            <span>Artificial Analysis source snapshot</span>
            <strong>Models, endpoints & extracted graph data</strong>
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
          <a href="https://cognition.com/frontiercode" target="_blank" rel="noreferrer">
            FrontierCode ↗
          </a>
          <a href="https://deepswe.datacurve.ai/" target="_blank" rel="noreferrer">
            DeepSWE ↗
          </a>
          <a href="https://livebench.ai/" target="_blank" rel="noreferrer">
            LiveBench ↗
          </a>
        </div>
      </section>
    </main>
  );
}
