import type { PopulationPoint } from "./statfin";

export const populationFormat = new Intl.NumberFormat("fi-FI");
export const signedPopulationFormat = new Intl.NumberFormat("fi-FI", { signDisplay: "exceptZero" });
export const percentFormat = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function populationChange(current: PopulationPoint, previous?: PopulationPoint) {
  if (current.population === null || !previous || previous.population === null) return null;
  const absolute = current.population - previous.population;
  return { absolute, percent: previous.population === 0 ? null : (absolute / previous.population) * 100 };
}

export function relativePopulationPoints(points: PopulationPoint[], baselineYear?: string): PopulationPoint[] {
  const baseline = points.find((point) => point.year === baselineYear)?.population;
  return points.map((point) => ({
    year: point.year,
    population: !baseline || point.population === null || Number(point.year) < Number(baselineYear)
      ? null : ((point.population - baseline) / baseline) * 100,
  }));
}

export function populationCsv(name: string, points: PopulationPoint[]) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return "\uFEFF" + [
    "Kunta;Vuosi;Väkiluku",
    ...points.map((point) => `${quote(name)};${point.year};${point.population ?? ""}`),
  ].join("\r\n");
}
