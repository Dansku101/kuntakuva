import { parse } from "csv-parse/sync";

const BASE = "https://paastot.hiilineutraalisuomi.fi";
export const climateSource = `${BASE}/`;
export const climateMethod = "https://hiilineutraalisuomi.syke.fi/paastotieto/paastotiedot-ja-indikaattorit/kuntien-kayttoperaiset-paastot-ja-ilmastoindikaattorit/";

export const climateSectors = [
  { code: "Kul", label: "Kulutussähkö" }, { code: "Säh", label: "Sähkölämmitys" },
  { code: "Kau", label: "Kaukolämpö" }, { code: "Ölj", label: "Öljylämmitys" },
  { code: "Muu", label: "Muu lämmitys" }, { code: "Teo", label: "Teollisuus" },
  { code: "Työ", label: "Työkoneet" }, { code: "Tie", label: "Tieliikenne" },
  { code: "Rai", label: "Raideliikenne" }, { code: "Ves", label: "Vesiliikenne" },
  { code: "Maa", label: "Maatalous" }, { code: "Jät", label: "Jätteiden käsittely" },
  { code: "F-k", label: "F-kaasut" },
];

type ClimateRow = {
  year: string; sector: string; hinku: boolean; energy: number | null; emissions: number | null;
};
export type ClimateProfile = {
  year: string; windGeneration: number | null; energy: number | null; emissions: number | null;
  sectors: (typeof climateSectors[number] & { energy: number | null; emissions: number | null; share: number | null })[];
};

function observation(raw: string): number | null {
  if (["", "..", "...", "-", "#ARVO!", "#JAKO/0!"].includes(raw)) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(raw)) throw new Error("Invalid climate observation");
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error("Invalid climate observation");
  return value;
}

const sum = (values: (number | null)[]) => !values.length || values.some((v) => v === null)
  ? null : values.reduce<number>((total, v) => total + v!, 0);

export function parseClimateTrend(csv: string, selectedYear: string): ClimateProfile[] {
  if (!/^\d{4}$/.test(selectedYear)) throw new Error("Invalid climate year");
  const columns = ["vuosi", "taso_3", "taso_4", "taso_5", "hinku_laskenta", "päästökauppa", "kt", "kt_tuuli", "GWh"];
  const records: Record<string, string>[] = parse(csv, {
    bom: true, delimiter: ";", record_delimiter: ["\r\r\n", "\r\n", "\n", "\r"],
    skip_empty_lines: true, trim: true, max_record_size: 4096,
    columns: (header: string[]) => {
      if (header.length !== columns.length || new Set(header).size !== columns.length ||
          columns.some((column) => !header.includes(column))) throw new Error("Unexpected climate columns");
      return header;
    },
  });
  if (!records.length) throw new Error("Empty climate dataset");
  const keys = new Set<string>();
  const rows: ClimateRow[] = [];
  for (const row of records) {
    // E-prefixed years are preliminary estimates; do not substitute them for final data.
    if (/^E\d{4}$/.test(row.vuosi)) continue;
    if (!/^\d{4}$/.test(row.vuosi) || !["0", "1"].includes(row.hinku_laskenta) ||
        !["0", "1"].includes(row["päästökauppa"]) || !row.taso_4 || !row.taso_5 ||
        ![...climateSectors.map((sector) => sector.code), "Tuu"].includes(row.taso_3)) {
      throw new Error("Unexpected climate category");
    }
    const key = JSON.stringify([row.vuosi, row.taso_3, row.taso_4, row.taso_5, row.hinku_laskenta, row["päästökauppa"]]);
    if (keys.has(key)) throw new Error("Duplicate climate observation");
    keys.add(key);
    rows.push({ year: row.vuosi, sector: row.taso_3, hinku: row.hinku_laskenta === "1",
      energy: observation(row.GWh), emissions: observation(row.kt) });
  }
  const years = [...new Set(rows.map((row) => row.year))].filter((year) => Number(year) <= Number(selectedYear)).sort();
  return years.map((year) => climateProfile(rows, year));
}

function climateProfile(rows: ClimateRow[], year: string): ClimateProfile {
  const selected = rows.filter((row) => row.year === year && row.hinku);
  const sectors = climateSectors.map((sector) => {
    const parts = selected.filter((row) => row.sector === sector.code);
    return { ...sector, energy: sum(parts.map((row) => row.energy)), emissions: sum(parts.map((row) => row.emissions)) };
  });
  // Tuu.GWh is generation, not consumption. kt_tuuli includes credits; use kt instead.
  const wind = selected.filter((row) => row.sector === "Tuu");
  if (wind.length > 1) throw new Error("Ambiguous wind generation");
  const emissions = sum(sectors.map((sector) => sector.emissions));
  const sharesAvailable = emissions !== null && emissions > 0 && sectors.every((sector) => sector.emissions !== null && sector.emissions >= 0);
  return { year, windGeneration: wind[0]?.energy ?? null,
    energy: sum(sectors.map((sector) => sector.energy)), emissions,
    sectors: sectors.map((sector) => ({ ...sector, share: sharesAvailable ? sector.emissions! / emissions! * 100 : null })) };
}

export function parseClimateProfile(csv: string, selectedYear: string): ClimateProfile | null {
  return parseClimateTrend(csv, selectedYear).at(-1) ?? null;
}

export async function getClimateTrend(code: string, selectedYear: string): Promise<ClimateProfile[]> {
  if (!/^KU\d{3}$/.test(code) || !/^\d{4}$/.test(selectedYear)) throw new Error("Invalid climate selection");
  // Syke publishes one file per official numeric municipality code (without leading zeros).
  const response = await fetch(`${BASE}/Tulokset_taso_5/kunta_${Number(code.slice(2))}.csv`, {
    cache: "force-cache", next: { revalidate: 86400 }, signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Climate request failed: ${response.status}`);
  return parseClimateTrend(await response.text(), selectedYear);
}

export async function getClimateProfile(code: string, selectedYear: string): Promise<ClimateProfile | null> {
  return (await getClimateTrend(code, selectedYear)).at(-1) ?? null;
}
