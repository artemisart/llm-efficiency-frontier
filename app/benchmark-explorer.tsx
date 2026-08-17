"use client";

import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
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
  parameters: number | null;
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
    codingAgentModelCount: number;
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
const PLOT_WIDTH = 620;
const PLOT_HEIGHT = 310;
const SIZE_RANGES = [
  { value: "all", label: "Any model size", min: null, max: null },
  { value: "known", label: "Known sizes only", min: 0, max: Infinity },
  { value: "under-7", label: "Under 7B", min: 0, max: 7 },
  { value: "7-30", label: "7B–30B", min: 7, max: 30 },
  { value: "30-100", label: "30B–100B", min: 30, max: 100 },
  { value: "100-300", label: "100B–300B", min: 100, max: 300 },
  { value: "300-plus", label: "300B+", min: 300, max: Infinity },
] as const;

type LabelLayoutNode = SimulationNodeDatum & {
  kind: "label" | "point";
  modelId?: string;
  anchorX: number;
  anchorY: number;
  radius: number;
  labelWidth?: number;
};

type TooltipPlacement = "top" | "right" | "bottom" | "left";

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

function formatParameters(value: number) {
  if (value < 1) return `${Math.round(value * 1000)}M parameters`;
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  })}B parameters`;
}

function roundPosition(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function chartPosition(ratio: number) {
  const clamped = Math.min(1, Math.max(0, ratio));
  return roundPosition(1.2 + clamped * 97.6);
}

function effortIdentity(model: Model) {
  const settings = model.name.match(/\(([^()]*)\)\s*$/);
  if (!settings) return null;
  const effort = settings[1].match(/\b(minimal|low|medium|xhigh|high|max)\s*(?:effort)?\b/i);
  if (!effort) return null;
  const level = effort[1].toLowerCase();
  return {
    key: `${model.creator.slug}:${model.name
      .slice(0, settings.index ?? model.name.length)
      .trim()
      .toLowerCase()}`,
    rank: EFFORT_RANK[level],
    label: level === "xhigh" ? "x-high" : level,
  };
}

function computeParetoLabels(models: Model[], benchmarkId: string) {
  const sorted = [...models].sort(
    (left, right) =>
      left.benchmarks[benchmarkId].cost - right.benchmarks[benchmarkId].cost ||
      right.benchmarks[benchmarkId].score - left.benchmarks[benchmarkId].score,
  );
  const frontier: Model[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const model of sorted) {
    const value = model.benchmarks[benchmarkId];
    if (value.score > bestScore) {
      frontier.push(model);
      bestScore = value.score;
    }
  }

  const representativeByEffortGroup = new Map<string, Model>();
  for (const model of frontier) {
    const groupKey = effortIdentity(model)?.key ?? `model:${model.id}`;
    const current = representativeByEffortGroup.get(groupKey);
    if (
      !current ||
      model.benchmarks[benchmarkId].score >
        current.benchmarks[benchmarkId].score
    ) {
      representativeByEffortGroup.set(groupKey, model);
    }
  }
  return new Set(
    [...representativeByEffortGroup.values()].map((model) => model.id),
  );
}

function createChartView(models: Model[], benchmarkId: string, linearCost: boolean) {
  const values = models.map((model) => model.benchmarks[benchmarkId]);
  if (!values.length) {
    return {
      scoreMin: 0,
      scoreMax: 1,
      xMin: 0,
      xMax: 1,
      x: () => 0,
      y: () => 0,
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
  const yMin =
    scoreMin < 0 ? scoreMin - yPadding : Math.max(0, scoreMin - yPadding);
  const yMax = Math.max(0, scoreMax + yPadding);

  return {
    scoreMin: yMin,
    scoreMax: yMax,
    xMin,
    xMax,
    x(model: Model) {
      const cost = model.benchmarks[benchmarkId].cost;
      const position = linearCost ? cost : Math.log10(cost);
      return chartPosition(
        (position - xMin) / Math.max(xMax - xMin, 0.00001),
      );
    },
    y(model: Model) {
      const value = model.benchmarks[benchmarkId].score;
      return chartPosition(
        1 - (value - yMin) / Math.max(yMax - yMin, 0.00001),
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

function createParetoLabelLayout(
  models: Model[],
  view: ReturnType<typeof createChartView>,
  paretoLabels: Set<string>,
) {
  const pointNodes: LabelLayoutNode[] = models.map((model) => {
    const x = (view.x(model) / 100) * PLOT_WIDTH;
    const y = (view.y(model) / 100) * PLOT_HEIGHT;
    return {
      kind: "point",
      anchorX: x,
      anchorY: y,
      x,
      y,
      fx: x,
      fy: y,
      radius: 7,
    };
  });
  const labelNodes: LabelLayoutNode[] = models
    .filter((model) => paretoLabels.has(model.id))
    .map((model) => {
      const anchorX = (view.x(model) / 100) * PLOT_WIDTH;
      const anchorY = (view.y(model) / 100) * PLOT_HEIGHT;
      const labelWidth = Math.min(
        110,
        Math.max(38, model.shortName.length * 4.7 + 10),
      );
      const placeLeft = anchorX > PLOT_WIDTH * 0.7;
      return {
        kind: "label",
        modelId: model.id,
        anchorX: Math.min(
          PLOT_WIDTH - labelWidth / 2,
          Math.max(
            labelWidth / 2,
            anchorX + (placeLeft ? -(labelWidth / 2 + 12) : labelWidth / 2 + 12),
          ),
        ),
        anchorY: Math.min(PLOT_HEIGHT - 9, Math.max(9, anchorY - 10)),
        x: anchorX + (placeLeft ? -(labelWidth / 2 + 12) : labelWidth / 2 + 12),
        y: anchorY - 10,
        radius: Math.hypot(labelWidth, 16) / 2 + 3,
        labelWidth,
      };
    });

  const nodes = [...pointNodes, ...labelNodes];
  const simulation = forceSimulation(nodes)
    .force(
      "x",
      forceX<LabelLayoutNode>((node) => node.anchorX).strength((node) =>
        node.kind === "label" ? 0.18 : 0,
      ),
    )
    .force(
      "y",
      forceY<LabelLayoutNode>((node) => node.anchorY).strength((node) =>
        node.kind === "label" ? 0.24 : 0,
      ),
    )
    .force(
      "collide",
      forceCollide<LabelLayoutNode>((node) => node.radius)
        .strength(0.92)
        .iterations(3),
    )
    .alphaDecay(0.045)
    .velocityDecay(0.55)
    .stop();

  for (let index = 0; index < 180; index += 1) {
    simulation.tick();
    for (const node of labelNodes) {
      const halfWidth = (node.labelWidth ?? 40) / 2;
      node.x = Math.min(
        PLOT_WIDTH - halfWidth,
        Math.max(halfWidth, node.x ?? node.anchorX),
      );
      node.y = Math.min(
        PLOT_HEIGHT - 9,
        Math.max(9, node.y ?? node.anchorY),
      );
    }
  }

  return new Map(
    labelNodes.map((node) => [
      node.modelId!,
      {
        left: ((node.x ?? node.anchorX) / PLOT_WIDTH) * 100,
        top: ((node.y ?? node.anchorY) / PLOT_HEIGHT) * 100,
      },
    ]),
  );
}

function chooseTooltipPlacement(
  activeModel: Model | undefined,
  models: Model[],
  view: ReturnType<typeof createChartView>,
): TooltipPlacement {
  if (!activeModel) return "top";
  const x = view.x(activeModel);
  const y = view.y(activeModel);
  const width = 38;
  const height = 35;
  const gap = 4;
  const points = models
    .filter((model) => model.id !== activeModel.id)
    .map((model) => ({ x: view.x(model), y: view.y(model) }));
  const candidates: Array<{
    placement: TooltipPlacement;
    left: number;
    top: number;
  }> = [
    { placement: "top", left: x - width / 2, top: y - height - gap },
    { placement: "bottom", left: x - width / 2, top: y + gap },
    { placement: "right", left: x + gap, top: y - height / 2 },
    { placement: "left", left: x - width - gap, top: y - height / 2 },
  ];

  return candidates
    .map((candidate, priority) => {
      const right = candidate.left + width;
      const bottom = candidate.top + height;
      const hiddenPoints = points.filter(
        (point) =>
          point.x >= candidate.left &&
          point.x <= right &&
          point.y >= candidate.top &&
          point.y <= bottom,
      ).length;
      const overflow =
        Math.max(0, -candidate.left) +
        Math.max(0, right - 100) +
        Math.max(0, -candidate.top) +
        Math.max(0, bottom - 100);
      return {
        ...candidate,
        score: hiddenPoints * 100 + overflow * 8 + priority * 0.01,
      };
    })
    .sort((left, right) => left.score - right.score)[0].placement;
}

function BenchmarkChart({
  benchmark,
  models,
  linearCost,
  labels,
  activePoint,
  setActivePoint,
  resetFilters,
}: ChartProps) {
  const {
    plotted,
    view,
    effortLinks,
    paretoLabels,
    paretoLabelLayout,
  } = useMemo(() => {
    const nextPlotted = models.filter((model) => model.benchmarks[benchmark.id]);
    const nextView = createChartView(nextPlotted, benchmark.id, linearCost);
    const nextParetoLabels = computeParetoLabels(nextPlotted, benchmark.id);
    return {
      plotted: nextPlotted,
      view: nextView,
      effortLinks: createEffortLinks(nextPlotted, benchmark.id, nextView),
      paretoLabels: nextParetoLabels,
      paretoLabelLayout: createParetoLabelLayout(
        nextPlotted,
        nextView,
        nextParetoLabels,
      ),
    };
  }, [benchmark.id, linearCost, models]);
  const activeModel = plotted.find(
    (model) => activePoint === `${benchmark.id}:${model.id}`,
  );
  const activeEffortKey = activeModel ? effortIdentity(activeModel)?.key : null;
  const activeEffortHasLine = effortLinks.some(
    (link) => link.groupKey === activeEffortKey,
  );
  const activeProviderSlug = activeModel?.creator.slug ?? null;
  const tooltipPlacement = chooseTooltipPlacement(activeModel, plotted, view);
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
    <article className="gallery-card">
      <div className="gallery-card-heading">
        <h3>{benchmark.label}</h3>
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
          <span className="y-axis-title">Performance →</span>
          <div className="y-ticks" aria-hidden="true">
            {yTicks.map((tick) => (
              <span key={tick.position} style={{ top: `${tick.position}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
          <div
            className={`plot-area ${activeModel ? "has-active-point" : ""}`}
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
              const modelEffort = effortIdentity(model);
              const isEffortPeer =
                activeEffortHasLine && modelEffort?.key === activeEffortKey;
              const isProviderPeer =
                activeProviderSlug !== null &&
                model.creator.slug === activeProviderSlug;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`point ${isActive ? "selected" : ""} ${
                    isProviderPeer ? "provider-peer" : "provider-muted"
                  } ${isEffortPeer ? "effort-peer" : ""}`}
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
                    <span
                      className={`point-label ${x > 74 ? "align-right" : ""}`}
                    >
                      {model.shortName}
                    </span>
                  )}
                  {isEffortPeer && modelEffort && (
                    <span
                      className={`effort-level-label ${
                        x > 85 ? "align-right" : x < 15 ? "align-left" : ""
                      } ${y > 82 ? "place-above" : ""}`}
                    >
                      {modelEffort.label}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className={`tooltip tooltip-${tooltipPlacement} ${
                        x < 18 ? "edge-left" : ""
                      } ${x > 82 ? "edge-right" : ""} ${
                        y < 22 ? "edge-top" : ""
                      } ${y > 78 ? "edge-bottom" : ""}`}
                    >
                      <strong>{model.name}</strong>
                      <small>
                        {model.creator.name}
                        {Number.isFinite(model.parameters)
                          ? ` · ${formatParameters(model.parameters!)}`
                          : ""}
                      </small>
                      <b>{score(value.score, benchmark.scoreSuffix)}</b>
                      <em>{money(value.cost)} / task</em>
                    </span>
                  )}
                </button>
              );
            })}
            {!labels && (
              <div className="pareto-label-layer" aria-hidden="true">
                {plotted
                  .filter((model) => paretoLabels.has(model.id))
                  .map((model) => {
                    const position = paretoLabelLayout.get(model.id);
                    if (!position) return null;
                    return (
                      <span
                        key={model.id}
                        className="point-label frontier-label"
                        style={{
                          left: `${position.left}%`,
                          top: `${position.top}%`,
                        }}
                      >
                        {model.shortName}
                      </span>
                    );
                  })}
              </div>
            )}
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
        <strong>{plotted.length} plotted</strong>
      </div>
    </article>
  );
}

export function BenchmarkExplorer() {
  const [query, setQuery] = useState("");
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [sizeRange, setSizeRange] = useState("all");
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [linearCost, setLinearCost] = useState(false);
  const [labels, setLabels] = useState(false);
  const [activePoint, setActivePoint] = useState<string | null>(null);

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
    const selectedSizeRange = SIZE_RANGES.find(
      (range) => range.value === sizeRange,
    );
    return data.models.filter((model) => {
      if (!includeDeprecated && model.deprecated) return false;
      if (
        selectedCreators.length &&
        !selectedCreators.includes(model.creator.slug)
      ) {
        return false;
      }
      if (selectedSizeRange?.value !== "all") {
        if (!Number.isFinite(model.parameters)) return false;
        if (
          model.parameters! < (selectedSizeRange?.min ?? 0) ||
          model.parameters! >= (selectedSizeRange?.max ?? Infinity)
        ) {
          return false;
        }
      }
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
    includeDeprecated,
    openWeightsOnly,
    query,
    reasoningOnly,
    selectedCreators,
    sizeRange,
  ]);

  function resetFilters() {
    setQuery("");
    setSelectedCreators([]);
    setSizeRange("all");
    setReasoningOnly(false);
    setOpenWeightsOnly(false);
    setIncludeDeprecated(true);
    setActivePoint(null);
  }

  return (
    <main className="analytical-theme">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="LLM Efficiency Frontier home">
          <span>LEF</span>
          <strong>LLM Efficiency Frontier</strong>
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

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className="live-dot" />
          Data refreshed {new Date(data.meta.extractedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        <h1>LLM Efficiency Frontier</h1>
        <p className="hero-copy">
          Performance is only half the story. This gallery puts benchmark scores and task costs on the same field, so you can see which models deliver more for less. The results come from Artificial Analysis, FrontierCode, DeepSWE, and LiveBench.
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
              Artificial Analysis’s Intelligence Index and Coding Agent Index lead,
              followed by the component evaluations and three independent software and
              general-purpose benchmarks. Filters and cost scale apply to the complete gallery.
            </p>
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
          <div className="filter-control multi-select-control">
            <span>Labs</span>
            <details>
              <summary>
                {selectedCreators.length === 0
                  ? "All labs"
                  : selectedCreators.length === 1
                    ? creators.find(
                        (item) => item.slug === selectedCreators[0],
                      )?.name ?? "1 lab selected"
                    : `${selectedCreators.length} labs selected`}
              </summary>
              <div className="multi-select-menu">
                <div className="multi-select-actions">
                  <strong>Select labs</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCreators([]);
                      setActivePoint(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
                {creators.map((item) => (
                  <label key={item.slug}>
                    <input
                      type="checkbox"
                      checked={selectedCreators.includes(item.slug)}
                      onChange={(event) => {
                        setSelectedCreators((current) =>
                          event.target.checked
                            ? [...current, item.slug]
                            : current.filter((slug) => slug !== item.slug),
                        );
                        setActivePoint(null);
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <label className="size-control">
            <span>Model size</span>
            <select
              value={sizeRange}
              onChange={(event) => {
                setSizeRange(event.target.value);
                setActivePoint(null);
              }}
            >
              {SIZE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
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

        <div className="chart-toolbar">
          <span>Chart view</span>
          <div className="chart-toggles" aria-label="Chart view">
            <div className="cost-scale-toggle">
              <span>Cost:</span>
              <button
                type="button"
                className={linearCost ? "" : "active"}
                onClick={() => {
                  setLinearCost(false);
                  setActivePoint(null);
                }}
              >
                Log
              </button>
              <i aria-hidden="true" />
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
            </div>
            <button
              type="button"
              className={`labels-toggle ${labels ? "active" : ""}`}
              onClick={() => {
                setLabels((value) => !value);
                setActivePoint(null);
              }}
            >
              Labels
            </button>
          </div>
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
          {data.benchmarks.map((benchmark) => (
            <BenchmarkChart
              key={benchmark.id}
              benchmark={benchmark}
              models={filteredModels}
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
              Artificial Analysis model values come from its public graph payload, while
              Coding Agent Index values come from the structured data embedded in its public
              leaderboard. FrontierCode, DeepSWE, and LiveBench use their official releases.
            </p>
          </div>
          <div>
            <h3>What “cost” means</h3>
            <p>
              The composite Artificial Analysis Intelligence Index uses a weighted-average
              task cost. Its individual evaluations report average cost per task, while the
              Coding Agent Index pools observed pay-per-token API cost per task across its
              suite. FrontierCode reports average task cost, DeepSWE mean rollout cost, and
              LiveBench cost per successful task. Axis labels and card notes make those
              differences explicit.
            </p>
          </div>
          <div>
            <h3>Coverage</h3>
            <p>
              All {data.meta.modelCount} model records and {data.meta.endpointCount} provider
              variants from Artificial Analysis are retained, alongside{" "}
              {data.meta.externalModelCount} current benchmark configurations, including{" "}
              {data.meta.codingAgentModelCount} coding-agent runs. A point appears only where
              both a score and positive task cost exist.
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
