// Published observation years, not release years. Never substitute future data.
const GRID_YEARS = [2005, ...Array.from({ length: 16 }, (_, i) => 2010 + i)];

export function gridYearFor(year: string): number | null {
  return /^\d{4}$/.test(year) ? GRID_YEARS.filter((item) => item <= Number(year)).at(-1) ?? null : null;
}

export function safeWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
