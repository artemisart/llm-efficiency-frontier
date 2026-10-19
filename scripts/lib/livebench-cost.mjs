// LiveBench's default Overall view divides pooled task cost by the rounded
// category-average score. The CSV summary column can lag this calculation.
export function liveBenchMetrics(row, costs, categories) {
  const groups = Object.values(categories);
  if (!groups.length || groups.some((tasks) => !Array.isArray(tasks) || !tasks.length)) throw new Error("Invalid LiveBench categories");
  const scores = groups.map((tasks) => {
    const values = tasks.map((task) => Number.parseFloat(row[task])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
  }).filter(Number.isFinite);
  const score = Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2));
  let spend = 0, count = 0;
  for (const task of groups.flat()) {
    const cost = Number(costs?.[task]), questions = Number(costs?.[`nq_${task}`]);
    if (Number.isFinite(cost) && Number.isFinite(questions) && questions > 0) {
      spend += cost;
      count += questions;
    }
  }
  return { score, cost: score > 0 && count > 0 ? spend / count / score * 100 : null };
}
