export const TERMINAL_BENCH_API = "https://ofhuhcpkvzjlejydnvyd.supabase.co/functions/v1/leaderboard-read";
export const TERMINAL_BENCH_EDITIONS = [
  { id: "terminal-bench-official-4-0", label: "Terminal-Bench 4.0 — official", shortLabel: "Terminal official", package: "terminal-bench/terminal-bench", name: "4-0-0", sourceUrl: "https://www.tbench.ai/", tasks: 66 },
  { id: "terminal-bench-official-2-1", label: "Terminal-Bench 2.1 — official", shortLabel: "Terminal 2.1 official", package: "terminal-bench/terminal-bench-2-1", name: "main", sourceUrl: "https://www.tbench.ai/?version=2.1", tasks: 89 },
  { id: "terminal-bench-science-official-0-1", label: "Terminal-Bench-Science 0.1 — official", shortLabel: "TB-Science official", package: "terminal-bench-science/terminal-bench-science", name: "v0-1-eval", sourceUrl: "https://terminal-bench-science.ai/", tasks: 70,
    dataUrl: "https://terminal-bench-science.ai/api/leaderboard?package=terminal-bench-science%2Fterminal-bench-science&name=v0-1-eval" },
];

export function validateTerminalLeaderboard(payload, edition) {
  if (payload.leaderboard?.package !== edition.package || payload.leaderboard?.name !== edition.name || !Array.isArray(payload.rows) || !payload.rows.length) {
    throw new Error(`Unexpected official Terminal-Bench edition: ${edition.id}`);
  }
}

export function terminalBenchmarkPoint(row, edition) {
  if (row.status !== "display") return null;
  const metrics = row.metrics;
  if (!Number.isFinite(metrics?.accuracy) || metrics.accuracy < 0 || metrics.accuracy > 100) throw new Error(`Invalid official Terminal-Bench score: ${row.id}`);
  // The official display reports total spend over every trial, not a task
  // average. Convert using the same trial count that produced the score.
  // Science calls the scored attempt count `tasks` (70 tasks × 3 repeats).
  const trials = edition?.id === "terminal-bench-science-official-0-1" ? metrics.tasks : metrics.n_trials;
  if (!(Number.isFinite(metrics.total_cost_usd) && metrics.total_cost_usd > 0 && Number.isFinite(trials) && trials > 0)) return null;
  // The top-level count can differ from metrics.n_trials. Keep the denominator
  // published alongside the spend, and retain any discrepancy for inspection.
  return { score: metrics.accuracy, cost: metrics.total_cost_usd / trials,
    rawTotalCost: metrics.total_cost_usd, trialCount: trials, costBasis: "source-total-per-trial",
    ...(Number.isFinite(row.n_trials) && row.n_trials !== trials ? { reportedRowTrialCount: row.n_trials } : {}) };
}

export async function downloadTerminalBench() {
  const editions = await Promise.all(TERMINAL_BENCH_EDITIONS.map(async (edition) => {
    const response = await fetch(edition.dataUrl ?? TERMINAL_BENCH_API, edition.dataUrl ? { signal: AbortSignal.timeout(60_000) } : {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: edition.package, name: edition.name }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Official Terminal-Bench ${edition.id}: HTTP ${response.status}`);
    const payload = await response.json();
    validateTerminalLeaderboard(payload, edition);
    return { id: edition.id, ...payload };
  }));
  return { extractedAt: new Date().toISOString(), sourceUrl: "https://www.tbench.ai/", editions };
}
