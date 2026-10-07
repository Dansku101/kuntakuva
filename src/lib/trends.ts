export function percentagePointChange(current: { year: string; value: number | null }, previous?: { year: string; value: number | null }) {
  if (!previous || Number(current.year) - Number(previous.year) !== 1 ||
      current.value === null || previous.value === null ||
      !Number.isFinite(current.value) || !Number.isFinite(previous.value)) return null;
  return current.value - previous.value;
}

export function fiveYearPopulationChange(points: { year: string; population: number | null }[], year: string) {
  const current = points.find((p) => p.year === year)?.population;
  const baseline = points.find((p) => Number(p.year) === Number(year) - 5)?.population;
  if (current == null || baseline == null || !Number.isFinite(current) ||
      !Number.isFinite(baseline) || current < 0 || baseline <= 0) return null;
  return (current - baseline) / baseline * 100;
}
