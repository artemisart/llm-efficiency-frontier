"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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
  historical?: boolean;
  refreshedAt?: string;
  refreshNote?: string;
  pricingNote?: string;
};

type DataShape = {
  meta: {
    source: string;
    extractedAt: string;
    modelCount: number;
    sourceModelCount: number;
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

type LabIdentity = {
  key: string;
  name: string;
};

type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type LabelLayout = {
  left: number;
  top: number;
  leader: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null;
};

const LABEL_HEIGHT = 13;
const LABEL_GAP = 5;
const LABEL_PADDING = 3;
const POINT_CLEARANCE = 8;

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

function createScoreTicks(min: number, max: number, suffix: string) {
  const range = max - min;
  if (range <= 0) return [];

  // Keep the established detail on ordinary score ranges, but avoid drawing
  // dozens of horizontal rows when a benchmark uses a larger score scale.
  const step =
    range <= 50
      ? 10
      : range <= 200
        ? 25
        : (() => {
            const roughStep = range / 10;
            const magnitude = 10 ** Math.floor(Math.log10(roughStep));
            const normalizedStep = roughStep / magnitude;
            const stepMultiplier =
              normalizedStep < 2.25
                ? 2
                : normalizedStep < 3.5
                  ? 2.5
                  : normalizedStep < 7
                    ? 5
                    : 10;
            return stepMultiplier * magnitude;
          })();
  const firstTick = Math.ceil(min / step) * step;
  const lastTick = Math.floor(max / step) * step;
  const ticks = [];

  for (let value = firstTick; value <= lastTick; value += step) {
    ticks.push({
      position: ((max - value) / range) * 100,
      label: `${value}${suffix}`,
    });
  }

  return ticks;
}

function compactMoney(value: number) {
  const maximumFractionDigits = Math.max(
    0,
    Math.min(8, -Math.floor(Math.log10(value)) + 1),
  );
  return `$${value.toLocaleString("en-US", { maximumFractionDigits })}`;
}

function createCostTicks(min: number, max: number, linear: boolean) {
  const range = max - min;
  if (range <= 0) return [];

  if (linear) {
    const roughStep = range / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / magnitude;
    const stepMultiplier =
      normalizedStep < Math.sqrt(2)
        ? 1
        : normalizedStep < Math.sqrt(10)
          ? 2
          : normalizedStep < Math.sqrt(50)
            ? 5
            : 10;
    const step = stepMultiplier * magnitude;
    const firstTick = Math.ceil(min / step) * step;
    const lastTick = Math.floor(max / step) * step;
    const ticks = [];

    for (let value = firstTick; value <= lastTick + step * 1e-9; value += step) {
      const roundedValue = Number(value.toPrecision(12));
      ticks.push({
        position: ((roundedValue - min) / range) * 100,
        label: compactMoney(roundedValue),
      });
    }

    return ticks;
  }

  const multipliers = range <= 2 ? [1, 2, 5] : range <= 3 ? [1, 2, 5] : [1];
  const ticks = [];
  const firstExponent = Math.floor(min);
  const lastExponent = Math.ceil(max);

  for (let exponent = firstExponent; exponent <= lastExponent; exponent += 1) {
    for (const multiplier of multipliers) {
      const value = multiplier * 10 ** exponent;
      const axisValue = Math.log10(value);
      if (axisValue < min - 1e-9 || axisValue > max + 1e-9) continue;
      ticks.push({
        position: ((axisValue - min) / range) * 100,
        label: compactMoney(value),
      });
    }
  }

  return ticks;
}

function createCostGridLines(
  min: number,
  max: number,
  linear: boolean,
  ticks: Array<{ position: number }>,
) {
  if (linear) {
    return ticks.map((tick) => ({ position: tick.position, minor: false }));
  }

  const range = max - min;
  if (range <= 0) return [];

  const lines = [];
  const firstExponent = Math.floor(min);
  const lastExponent = Math.ceil(max);

  for (let exponent = firstExponent; exponent <= lastExponent; exponent += 1) {
    for (let multiplier = 1; multiplier <= 9; multiplier += 1) {
      const axisValue = Math.log10(multiplier * 10 ** exponent);
      if (axisValue < min - 1e-9 || axisValue > max + 1e-9) continue;

      const position = ((axisValue - min) / range) * 100;
      lines.push({
        position,
        minor: !ticks.some(
          (tick) => Math.abs(tick.position - position) < 1e-7,
        ),
      });
    }
  }

  return lines;
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

const MODEL_SIZE_MIN = Math.min(
  ...data.models
    .map((model) => model.parameters)
    .filter(
      (parameters): parameters is number =>
        parameters !== null && Number.isFinite(parameters) && parameters > 0,
    ),
);
const MODEL_SIZE_MAX = 4096;
const MODEL_SIZE_LOG_MIN = Math.log10(MODEL_SIZE_MIN);
const MODEL_SIZE_LOG_MAX = Math.log10(MODEL_SIZE_MAX);

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
  plotWidth: number,
  plotHeight: number,
) {
  const points = models.map((model) => ({
    modelId: model.id,
    x: (view.x(model) / 100) * plotWidth,
    y: (view.y(model) / 100) * plotHeight,
  }));
  const labels = models
    .filter((model) => paretoLabels.has(model.id))
    .map((model) => {
      const anchorX = (view.x(model) / 100) * plotWidth;
      const anchorY = (view.y(model) / 100) * plotHeight;
      const label = paretoLabel(model);
      const labelWidth = Math.min(
        110,
        Math.max(38, label.length * 4.7 + 10),
      );
      return {
        modelId: model.id,
        anchorX: Math.min(plotWidth, Math.max(0, anchorX)),
        anchorY: Math.min(plotHeight, Math.max(0, anchorY)),
        labelWidth,
      };
    })
    .sort((left, right) => left.anchorX - right.anchorX);
  const placed: LabelBox[] = [];
  const result = new Map<string, LabelLayout>();

  for (const label of labels) {
    const halfWidth = label.labelWidth / 2;
    const halfHeight = LABEL_HEIGHT / 2;
    const horizontalStep = Math.max(22, halfWidth * 0.7);
    const verticalStep = LABEL_HEIGHT + LABEL_PADDING + 2;
    const preferBelow = label.anchorY < LABEL_HEIGHT + LABEL_GAP + 4;
    const verticalDirections = preferBelow ? [1, -1] : [-1, 1];
    const candidates: Array<{ x: number; y: number; preference: number }> = [];

    for (const ring of [0, 1]) {
      for (const direction of verticalDirections) {
        for (const shift of [
          0,
          -horizontalStep,
          horizontalStep,
          -horizontalStep * 2,
          horizontalStep * 2,
        ]) {
          candidates.push({
            x: label.anchorX + shift,
            y:
              label.anchorY +
              direction *
                (halfHeight + LABEL_GAP + 4 + ring * verticalStep),
            preference: candidates.length,
          });
        }
      }
    }
    for (const ring of [0, 1]) {
      for (const direction of label.anchorX > plotWidth * 0.72
        ? [-1, 1]
        : [1, -1]) {
        for (const shift of [
          0,
          -verticalStep,
          verticalStep,
          -verticalStep * 2,
          verticalStep * 2,
        ]) {
          candidates.push({
            x:
              label.anchorX +
              direction *
                (halfWidth + LABEL_GAP + 4 + ring * horizontalStep),
            y: label.anchorY + shift,
            preference: candidates.length,
          });
        }
      }
    }

    const scored = candidates.map((candidate) => {
      const x = Math.min(
        plotWidth - halfWidth,
        Math.max(halfWidth, candidate.x),
      );
      const y = Math.min(
        plotHeight - halfHeight,
        Math.max(halfHeight, candidate.y),
      );
      const box = {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
      };
      const labelOverlap = placed.reduce((total, other) => {
        const width = Math.max(
          0,
          Math.min(box.right, other.right + LABEL_PADDING) -
            Math.max(box.left, other.left - LABEL_PADDING),
        );
        const height = Math.max(
          0,
          Math.min(box.bottom, other.bottom + LABEL_PADDING) -
            Math.max(box.top, other.top - LABEL_PADDING),
        );
        return total + width * height;
      }, 0);
      const coveredPoints = points.filter(
        (point) =>
          point.x >= box.left - POINT_CLEARANCE &&
          point.x <= box.right + POINT_CLEARANCE &&
          point.y >= box.top - POINT_CLEARANCE &&
          point.y <= box.bottom + POINT_CLEARANCE,
      ).length;
      const anchorCovered =
        label.anchorX >= box.left - POINT_CLEARANCE &&
        label.anchorX <= box.right + POINT_CLEARANCE &&
        label.anchorY >= box.top - POINT_CLEARANCE &&
        label.anchorY <= box.bottom + POINT_CLEARANCE;
      const distance = Math.hypot(x - label.anchorX, y - label.anchorY);
      return {
        box,
        x,
        y,
        score:
          (anchorCovered ? 100_000_000 : 0) +
          (labelOverlap > 0 ? 1_000_000 : 0) +
          labelOverlap * 1000 +
          coveredPoints * 10000 +
          distance +
          candidate.preference * 0.25,
      };
    });
    const best = scored.reduce((current, candidate) =>
      candidate.score < current.score ? candidate : current,
    );
    placed.push(best.box);

    const deltaX = label.anchorX - best.x;
    const deltaY = label.anchorY - best.y;
    const edgeScale = Math.min(
      Math.abs(deltaX) > 0 ? halfWidth / Math.abs(deltaX) : Infinity,
      Math.abs(deltaY) > 0 ? halfHeight / Math.abs(deltaY) : Infinity,
    );
    const edgeX = best.x + deltaX * edgeScale;
    const edgeY = best.y + deltaY * edgeScale;
    const leaderLength = Math.hypot(
      label.anchorX - edgeX,
      label.anchorY - edgeY,
    );

    result.set(label.modelId, {
      left: (best.x / plotWidth) * 100,
      top: (best.y / plotHeight) * 100,
      leader:
        leaderLength > LABEL_GAP + 3
          ? {
              x1: label.anchorX,
              y1: label.anchorY,
              x2: edgeX,
              y2: edgeY,
            }
          : null,
    });
  }

  return result;
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
  const plotAreaRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
  });

  useEffect(() => {
    const plotArea = plotAreaRef.current;
    if (!plotArea) return;
    const updateSize = () => {
      const { width, height } = plotArea.getBoundingClientRect();
      setPlotSize((current) =>
        Math.abs(current.width - width) < 0.5 &&
        Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(plotArea);
    return () => observer.disconnect();
  }, []);

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
        plotSize.width,
        plotSize.height,
      ),
    };
  }, [benchmark.id, linearCost, models, plotSize]);
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
  const xTicks = createCostTicks(view.xMin, view.xMax, linearCost);
  const xGridLines = createCostGridLines(
    view.xMin,
    view.xMax,
    linearCost,
    xTicks,
  );
  const yTicks = createScoreTicks(
    view.scoreMin,
    view.scoreMax,
    benchmark.scoreSuffix,
  );

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
      {benchmark.pricingNote && (
        <p className="gallery-card-description">{benchmark.pricingNote}</p>
      )}
      {benchmark.historical && (
        <p className="gallery-card-description">
          Historical snapshot ({benchmark.refreshedAt?.slice(0, 10)}). {benchmark.refreshNote}
        </p>
      )}

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
          <div
            ref={plotAreaRef}
            className={`plot-area ${activeModel ? "has-active-point" : ""} ${
              hasHighlight ? "has-highlight" : ""
            }`}
            onClick={() => setActivePoint(null)}
          >
            <div className="y-ticks" aria-hidden="true">
              {yTicks.map((tick) => (
                <span key={tick.position} style={{ top: `${tick.position}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="chart-better-zone" aria-hidden="true">
              <span>Better ↖</span>
            </div>
            {xGridLines.map((line) => (
              <i
                key={`x-${line.position}`}
                className={`grid-line vertical ${line.minor ? "minor" : ""}`}
                style={{ left: `${line.position}%` }}
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
                  data-model-id={model.id}
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
            <svg
              className="pareto-label-links"
              viewBox={`0 0 ${plotSize.width} ${plotSize.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {plotted
                .filter((model) => paretoLabels.has(model.id))
                .map((model) => {
                  const leader = paretoLabelLayout.get(model.id)?.leader;
                  if (!leader) return null;
                  return (
                    <line
                      key={model.id}
                      x1={leader.x1}
                      y1={leader.y1}
                      x2={leader.x2}
                      y2={leader.y2}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
            </svg>
            <div className="pareto-label-layer" aria-hidden="true">
              {plotted
                .filter((model) => paretoLabels.has(model.id))
                .map((model) => {
                  const position = paretoLabelLayout.get(model.id);
                  if (!position) return null;
                  return (
                    <span
                      key={model.id}
                      data-model-id={model.id}
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

  const resetModelSize = useCallback(() => {
    setSizeMin(MODEL_SIZE_MIN);
    setSizeMax(MODEL_SIZE_MAX);
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
          Performance is only half the story. This gallery puts benchmark scores and task costs on the same field, so you can see which models deliver more for less. The results come from Artificial Analysis, FrontierCode, DeepSWE, LiveBench, and the official Terminal-Bench leaderboards.
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
              followed by the component evaluations and independent software and
              general-purpose benchmarks. Filters and cost scale apply to the complete gallery.
            </p>
          </div>
        </div>

        <div className="controls">
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
          <div className="size-control">
            <div className="size-control-heading">
              <span>Model size</span>
              <button
                type="button"
                onClick={resetModelSize}
                disabled={
                  sizeMin === MODEL_SIZE_MIN && sizeMax === MODEL_SIZE_MAX
                }
                aria-label="Reset model size filter"
              >
                Reset
              </button>
            </div>
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
          </div>
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
              leaderboard. FrontierCode, DeepSWE, LiveBench, and Terminal-Bench also use
              their official releases. Separately labeled cards preserve each evaluator’s
              agent, model, harness, and benchmark edition.
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
              differences explicit. Benchmarks without published task costs are excluded.
            </p>
          </div>
          <div>
            <h3>Coverage</h3>
            <p>
              {data.meta.modelCount} of {data.meta.sourceModelCount} Artificial Analysis
              model records have both a score and positive task cost and are included,
              alongside {data.meta.endpointCount} provider variants and{" "}
              {data.meta.externalModelCount} current benchmark configurations, including{" "}
              {data.meta.codingAgentModelCount} coding-agent variants.
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
          <a href="https://www.tbench.ai/" target="_blank" rel="noreferrer">Terminal-Bench ↗</a>
        </div>
      </section>
    </main>
  );
}
