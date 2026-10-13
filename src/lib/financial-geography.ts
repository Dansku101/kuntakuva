// Reviewed for the supported 2024-2025 accounts and the 2026 population table.
// https://stat.fi/fi/luokitukset/kunta/kunta_1_20260101
const boundaryChanges: Record<string, number[]> = {
  KU507: [2025], KU588: [2025],
  KU418: [2025], KU837: [2025],
  KU740: [2026], KU046: [2026],
};

export function sameFinancialArea(code: string, from: string, to: string): boolean {
  if (!/^KU\d{3}$/.test(code) || !/^202[4-6]$/.test(from) || !/^202[4-6]$/.test(to)) return false;
  const first = Math.min(Number(from), Number(to));
  const last = Math.max(Number(from), Number(to));
  return !(boundaryChanges[code] ?? []).some((year) => year > first && year <= last);
}

export function compatibleFinancialPopulation(code: string, year: string, population: number | null): number | null {
  return ["2024", "2025"].includes(year) && sameFinancialArea(code, year, "2026") ? population : null;
}
