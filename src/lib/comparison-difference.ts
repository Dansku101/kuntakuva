import type { ComparisonRow } from "./comparison";

export function comparisonDifference(row: ComparisonRow): { value: number | null; unit: string } {
  const [primary, peer] = row.values;
  return {
    value: row.year && primary !== null && peer !== null && Number.isFinite(primary) && Number.isFinite(peer)
      ? peer - primary : null,
    unit: row.unit === "%" ? "prosenttiyks." : row.unit,
  };
}
