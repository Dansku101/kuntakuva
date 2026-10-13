const URL = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/raku/15er.px";
export const heatingSource = "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/raku/15er.px/";
const AREA = "alue_23_20260101";
const TIME = "timeperiod_y";
const HEATING = "polttoaineet_12_20260101";
export const heatingGroups = [
  { code: "01", label: "Kauko- tai aluelämpö", color: "#387c99" },
  { code: "02_03_05", label: "Öljy ja kaasu", color: "#8d7461" },
  { code: "04", label: "Sähkö", color: "#bd9137" },
  { code: "06", label: "Kivihiili", color: "#596168" },
  { code: "07_08", label: "Puu ja turve", color: "#9b686c" },
  { code: "09", label: "Maalämpö", color: "#357a61" },
  { code: "99", label: "Muu tai tuntematon", color: "#88948e" },
];
type Metadata = { variables: { code: string; values: string[] }[] };
type Dataset = {
  id: string[]; size: number[]; value: (number | null)[];
  dimension: Record<string, { category: { index: string[] | Record<string, number> } }>;
};
export type HeatingProfile = {
  year: string; total: number | null;
  groups: (typeof heatingGroups[number] & { count: number | null; share: number | null })[];
};

export function parseHeatingCounts(data: Dataset, selections: Record<string, string[]>) {
  const ids = Object.keys(selections);
  const categories = selections[HEATING];
  if (!data || !Array.isArray(data.id) || data.id.length !== ids.length || new Set(data.id).size !== ids.length ||
      !Array.isArray(data.size) || data.size.length !== ids.length || !Array.isArray(data.value) ||
      data.value.length !== categories.length) throw new Error("Unexpected heating dimensions");
  for (const [i, id] of data.id.entries()) {
    const expected = selections[id];
    const index = data.dimension?.[id]?.category?.index;
    if (!expected || !index || data.size[i] !== expected.length || Object.keys(index).length !== expected.length) {
      throw new Error("Unexpected heating categories");
    }
    const positions = expected.map((key) => Array.isArray(index) ? index.indexOf(key) : index[key]);
    if (positions.some((n) => !Number.isInteger(n) || n < 0 || n >= expected.length) || new Set(positions).size !== expected.length) {
      throw new Error("Invalid heating index");
    }
  }
  const index = data.dimension[HEATING].category.index;
  const counts = Object.fromEntries(categories.map((code) => {
    const value = data.value[Array.isArray(index) ? index.indexOf(code) : index[code]];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid building count");
    return [code, value];
  }));
  const parts = heatingGroups.map(({ code }) => counts[code]);
  if (counts.SSS !== null && (parts.some((v) => v !== null && v > counts.SSS!) ||
      parts.every((v) => v !== null) && parts.reduce<number>((sum, v) => sum + v!, 0) !== counts.SSS)) {
    throw new Error("Heating categories do not reconcile");
  }
  return counts;
}

export async function getHeatingProfile(code: string, selectedYear: string): Promise<HeatingProfile | null> {
  if (!/^KU\d{3}$/.test(code) || !/^\d{4}$/.test(selectedYear)) throw new Error("Invalid heating selection");
  const options = { cache: "force-cache" as const, next: { revalidate: 86400 } };
  const response = await fetch(URL, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Heating metadata failed: ${response.status}`);
  const metadata = await response.json() as Metadata;
  if (!Array.isArray(metadata.variables)) throw new Error("Invalid heating metadata");
  const variable = (id: string) => metadata.variables.find((v) => v.code === id)?.values;
  const year = variable(TIME)?.filter((y) => /^\d{4}$/.test(y) && Number(y) <= Number(selectedYear)).sort().at(-1);
  if (!year || !variable(AREA)?.includes(code)) return null;
  const selections: Record<string, string[]> = {
    [AREA]: [code], [TIME]: [year], rakennus_6_20180101: ["SSS"], rak_valm_v_10_20210101: ["SSS"],
    [HEATING]: ["SSS", ...heatingGroups.map((g) => g.code)], contentscode: ["rakennus_lkm"],
  };
  for (const [id, values] of Object.entries(selections)) {
    if (values.some((value) => !variable(id)?.includes(value))) throw new Error(`Missing heating category ${id}`);
  }
  const observations = await fetch(URL, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ query: Object.entries(selections).map(([id, values]) => ({ code: id, selection: { filter: "item", values } })), response: { format: "json-stat2" } }),
  });
  if (!observations.ok) throw new Error(`Heating data failed: ${observations.status}`);
  const counts = parseHeatingCounts(await observations.json(), selections);
  const total = counts.SSS;
  return { year, total, groups: heatingGroups.map((group) => ({ ...group, count: counts[group.code],
    share: total === null || total === 0 || counts[group.code] === null ? null : counts[group.code]! / total * 100 })) };
}
