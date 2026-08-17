"use client";

import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
  highlightQuery: string;
  activePoint: string | null;
  setActivePoint: (value: string | null) => void;
  resetFilters: () => void;
};

const data = sourceData as unknown as DataShape;
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
const MODEL_SIZE_MIN = 0.1;
const MODEL_SIZE_MAX = 4096;
const MODEL_SIZE_LOG_MIN = Math.log10(MODEL_SIZE_MIN);
const MODEL_SIZE_LOG_MAX = Math.log10(MODEL_SIZE_MAX);

type LabIdentity = {
  key: string;
  name: string;
};

type LabelLayoutNode = SimulationNodeDatum & {
  kind: "label" | "point";
  modelId?: string;
  anchorX: number;
  anchorY: number;
  radius: number;
  labelWidth?: number;
};

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

function formatModelSize(value: number) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value < 1 ? 1 : 0,
  })}B`;
}

function modelSizeFromLog(value: number) {
  return 10 ** value;
}

function modelSizeRatio(value: number) {
  return (
    (Math.log10(value) - MODEL_SIZE_LOG_MIN) /
    (MODEL_SIZE_LOG_MAX - MODEL_SIZE_LOG_MIN)
  );
}

function labIdentity(creator: Model["creator"]): LabIdentity {
  const normalizedName = creator.name.toLowerCase().replace(/[.\s-]/g, "");
  const normalizedSlug = creator.slug.toLowerCase();
  if (
    normalizedName === "alibaba" ||
    normalizedName === "alibabacloud" ||
    normalizedSlug === "alibaba" ||
    normalizedSlug === "alibaba-cloud"
  ) {
    return { key: "alibaba", name: "Alibaba" };
  }
  if (
    normalizedName === "zai" ||
    normalizedSlug === "z-ai" ||
    normalizedSlug === "zai"
  ) {
    return { key: "z-ai", name: "Z AI" };
  }
  return { key: creator.slug, name: creator.name };
}

function modelSearchText(model: Model) {
  const lab = labIdentity(model.creator);
  return `${model.name} ${model.shortName} ${model.creator.name} ${lab.name}`.toLowerCase();
}

function matchesModelQuery(model: Model, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return Boolean(
    normalizedQuery && modelSearchText(model).includes(normalizedQuery),
  );
}

function isPlottableValue(value: BenchmarkValue | undefined) {
  return Boolean(
    value &&
      Number.isFinite(value.score) &&
      Number.isFinite(value.cost) &&
      value.cost > 0,
  );
}

function hasPlottableBenchmark(model: Model) {
  return Object.values(model.benchmarks).some(isPlottableValue);
}

function paretoLabel(model: Model) {
  return model.shortName
    .replace(/\s*\((?:minimal|low|medium|high|xhigh|max)(?:\s+effort)?\)/gi, "")
    .replace(/\bGPT-/gi, "")
    .replace(/\bClaude\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
      const label = paretoLabel(model);
      const labelWidth = Math.min(
        110,
        Math.max(38, label.length * 4.7 + 10),
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

const BenchmarkChart = memo(function BenchmarkChart({
  benchmark,
  models,
  linearCost,
  activePoint,
  highlightQuery,
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
    const nextPlotted = models.filter((model) =>
      isPlottableValue(model.benchmarks[benchmark.id]),
    );
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
  const activeProviderKey = activeModel
    ? labIdentity(activeModel.creator).key
    : null;
  const hasHighlight = Boolean(highlightQuery.trim());
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
        <div
          className="plot-shell"
          onMouseLeave={() => setActivePoint(null)}
        >
          <div className="point-info" aria-live="polite">
            {activeModel ? (
              <>
                <div className="point-info-model">
                  <strong>{activeModel.name}</strong>
                  <small>
                    {labIdentity(activeModel.creator).name}
                    {Number.isFinite(activeModel.parameters)
                      ? ` · ${formatParameters(activeModel.parameters!)}`
                      : ""}
                  </small>
                </div>
                <div className="point-info-metric">
                  <span>Performance</span>
                  <b>{score(activeModel.benchmarks[benchmark.id].score, benchmark.scoreSuffix)}</b>
                </div>
                <div className="point-info-metric">
                  <span>Cost / task</span>
                  <b>{money(activeModel.benchmarks[benchmark.id].cost)}</b>
                </div>
              </>
            ) : (
              <span className="point-info-empty">Hover a point to inspect its performance and cost</span>
            )}
          </div>
          <span className="y-axis-title">Performance →</span>
          <div className="y-ticks" aria-hidden="true">
            {yTicks.map((tick) => (
              <span key={tick.position} style={{ top: `${tick.position}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
          <div
            className={`plot-area ${activeModel ? "has-active-point" : ""} ${
              hasHighlight ? "has-highlight" : ""
            }`}
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
                activeProviderKey !== null &&
                labIdentity(model.creator).key === activeProviderKey;
              const isHighlighted = matchesModelQuery(model, highlightQuery);
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`point ${isActive ? "selected" : ""} ${
                    isProviderPeer ? "provider-peer" : "provider-muted"
                  } ${isEffortPeer ? "effort-peer" : ""} ${
                    hasHighlight
                      ? isHighlighted
                        ? "highlighted"
                        : "highlight-muted"
                      : ""
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
                  onMouseEnter={() => setActivePoint(pointId)}
                  onFocus={() => setActivePoint(pointId)}
                  onBlur={() => setActivePoint(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActivePoint(pointId);
                  }}
                >
                  {isEffortPeer && modelEffort && (
                    <span
                      className={`effort-level-label ${
                        x > 85 ? "align-right" : x < 15 ? "align-left" : ""
                      } ${y > 82 ? "place-above" : ""}`}
                    >
                      {modelEffort.label}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="pareto-label-layer" aria-hidden="true">
              {plotted
                .filter((model) => paretoLabels.has(model.id))
                .map((model) => {
                  const position = paretoLabelLayout.get(model.id);
                  if (!position) return null;
                  return (
                    <span
                      key={model.id}
                      className={`point-label frontier-label ${
                        hasHighlight
                          ? matchesModelQuery(model, highlightQuery)
                            ? "highlighted"
                            : "highlight-muted"
                          : ""
                      }`}
                      style={{
                        left: `${position.left}%`,
                        top: `${position.top}%`,
                      }}
                    >
                      {paretoLabel(model)}
                    </span>
                  );
                })}
            </div>
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
});

export function BenchmarkExplorer() {
  const [query, setQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [sizeMin, setSizeMin] = useState(MODEL_SIZE_MIN);
  const [sizeMax, setSizeMax] = useState(MODEL_SIZE_MAX);
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(true);
  const [linearCost, setLinearCost] = useState(false);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const deferredSizeMin = useDeferredValue(sizeMin);
  const deferredSizeMax = useDeferredValue(sizeMax);

  const creators = useMemo(() => {
    const map = new Map<string, LabIdentity>();
    for (const model of data.models.filter(hasPlottableBenchmark)) {
      const lab = labIdentity(model.creator);
      map.set(lab.key, lab);
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, []);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.models.filter((model) => {
      if (!hasPlottableBenchmark(model)) return false;
      if (!includeDeprecated && model.deprecated) return false;
      if (
        selectedCreators.length &&
        !selectedCreators.includes(labIdentity(model.creator).key)
      ) {
        return false;
      }
      if (
        deferredSizeMin > MODEL_SIZE_MIN ||
        deferredSizeMax < MODEL_SIZE_MAX
      ) {
        if (
          !Number.isFinite(model.parameters) ||
          model.parameters! < deferredSizeMin ||
          model.parameters! > deferredSizeMax
        ) {
          return false;
        }
      }
      if (reasoningOnly && !model.reasoning) return false;
      if (openWeightsOnly && !model.openWeights) return false;
      if (normalizedQuery && !modelSearchText(model).includes(normalizedQuery)) {
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
    deferredSizeMax,
    deferredSizeMin,
  ]);

  const resetFilters = useCallback(() => {
    setQuery("");
    setHighlightQuery("");
    setSelectedCreators([]);
    setSizeMin(MODEL_SIZE_MIN);
    setSizeMax(MODEL_SIZE_MAX);
    setReasoningOnly(false);
    setOpenWeightsOnly(false);
    setIncludeDeprecated(true);
    setActivePoint(null);
  }, []);

  return (
    <main>
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
            <span>Filter</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActivePoint(null);
              }}
              placeholder="Model or lab"
            />
          </label>
          <label className="highlight-control">
            <span>Highlight</span>
            <input
              value={highlightQuery}
              onChange={(event) => {
                setHighlightQuery(event.target.value);
                setActivePoint(null);
              }}
              placeholder="Model or lab"
            />
          </label>
          <div className="multi-select-control">
            <span>Labs</span>
            <details>
              <summary>
                {selectedCreators.length === 0
                  ? "All labs"
                  : selectedCreators.length === 1
                    ? creators.find(
                        (item) => item.key === selectedCreators[0],
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
                  <label key={item.key}>
                    <input
                      type="checkbox"
                      checked={selectedCreators.includes(item.key)}
                      onChange={(event) => {
                        setSelectedCreators((current) =>
                          event.target.checked
                            ? [...current, item.key]
                            : current.filter((key) => key !== item.key),
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
            <div className="size-range">
              <output>
                {sizeMin === MODEL_SIZE_MIN && sizeMax === MODEL_SIZE_MAX
                  ? "Any size"
                  : `${formatModelSize(sizeMin)} – ${formatModelSize(sizeMax)}`}
              </output>
              <div
                className="size-range-inputs"
                style={
                  {
                    "--size-min-position": `calc(8px + ${modelSizeRatio(sizeMin)} * (100% - 16px))`,
                    "--size-max-position": `calc(8px + ${modelSizeRatio(sizeMax)} * (100% - 16px))`,
                  } as CSSProperties
                }
              >
                <span className="size-range-track" aria-hidden="true" />
                <span className="size-range-selection" aria-hidden="true" />
                <input
                  className="size-range-handle min"
                  type="range"
                  min={MODEL_SIZE_LOG_MIN}
                  max={MODEL_SIZE_LOG_MAX}
                  step="0.01"
                  value={Math.log10(sizeMin)}
                  aria-label="Minimum model size in billions of parameters"
                  onChange={(event) => {
                    setSizeMin(
                      Math.min(
                        modelSizeFromLog(Number(event.target.value)),
                        sizeMax,
                      ),
                    );
                    setActivePoint(null);
                  }}
                />
                <input
                  className="size-range-handle max"
                  type="range"
                  min={MODEL_SIZE_LOG_MIN}
                  max={MODEL_SIZE_LOG_MAX}
                  step="0.01"
                  value={Math.log10(sizeMax)}
                  aria-label="Maximum model size in billions of parameters"
                  onChange={(event) => {
                    setSizeMax(
                      Math.max(
                        modelSizeFromLog(Number(event.target.value)),
                        sizeMin,
                      ),
                    );
                    setActivePoint(null);
                  }}
                />
              </div>
            </div>
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
          </div>
        </div>

        <div className="gallery-status">
          <span>Frontier labels show the strongest score at each cost level.</span>
          <strong>{filteredModels.length} matching model records</strong>
        </div>

        <div className="chart-gallery">
          {data.benchmarks.map((benchmark) => (
            <BenchmarkChart
              key={benchmark.id}
              benchmark={benchmark}
              models={filteredModels}
              linearCost={linearCost}
              highlightQuery={highlightQuery}
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
            <a
              href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/artificial-analysis-full.json`}
              download
            >
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
