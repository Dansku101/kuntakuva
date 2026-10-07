export const EMPLOYMENT_URL = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/tyokay/115b.px";
const AREA = "alue_23_20250101";
const ACTIVITY = "paaasial_toimin_3_20180101";
const SEX = "sukupuoli_9_20180101";
const AGE = "ikaryhma_10_20180101";
const TIME = "timeperiod_y";
const METRIC = "contentscode";
export type EmploymentPoint = { year: string; unemploymentRate: number | null };
type Category = { index: string[] | Record<string, number> };
type EmploymentResponse = {
  id: string[]; size: number[]; value: (number | null)[];
  dimension: Record<string, { category: Category }>;
};

function position(category: Category, key: string) {
  return Array.isArray(category.index) ? category.index.indexOf(key) : category.index[key];
}

export function parseEmployment(data: EmploymentResponse, code: string, years: string[]): EmploymentPoint[] {
  const selections: Record<string, string[]> = {
    [AREA]: [code], [ACTIVITY]: ["11+12", "12"], [SEX]: ["SSS"],
    [AGE]: ["18-64"], [TIME]: years, [METRIC]: ["tyokay-vaesto"],
  };
  if (!data || !Array.isArray(data.id) || !Array.isArray(data.size) || !Array.isArray(data.value) ||
      data.id.length !== 6 || new Set(data.id).size !== 6 || data.size.length !== 6 ||
      data.size.reduce((a, b) => a * b, 1) !== data.value.length ||
      data.id.some((id, i) => !selections[id] || data.size[i] !== selections[id].length ||
        !data.dimension?.[id]?.category || selections[id].some((key) => {
          const index = position(data.dimension[id].category, key);
          return !Number.isInteger(index) || index < 0 || index >= data.size[i];
        }) || new Set(selections[id].map((key) => position(data.dimension[id].category, key))).size !== selections[id].length)) {
    throw new Error("Unexpected employment dimensions.");
  }
  function value(year: string, activity: string) {
    let offset = 0;
    for (let i = 0; i < data.id.length; i++) {
      const id = data.id[i];
      const key = id === TIME ? year : id === ACTIVITY ? activity : selections[id][0];
      offset = offset * data.size[i] + position(data.dimension[id].category, key);
    }
    const amount = data.value[offset];
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new Error("Invalid employment count.");
    }
    return amount;
  }
  return years.map((year) => {
    const workforce = value(year, "11+12");
    const unemployed = value(year, "12");
    if (workforce !== null && unemployed !== null && unemployed > workforce) {
      throw new Error("Unemployment exceeds workforce.");
    }
    return { year, unemploymentRate: workforce === null || unemployed === null || workforce === 0
      ? null : unemployed / workforce * 100 };
  }).sort((a, b) => Number(a.year) - Number(b.year));
}

export async function getEmploymentTrend(code: string, selectedYear: string): Promise<EmploymentPoint[]> {
  if (!/^KU\d{3}$/.test(code) || !/^\d{4}$/.test(selectedYear)) throw new Error("Invalid municipality or year.");
  const options = { cache: "force-cache" as const, next: { revalidate: 86400 }, signal: AbortSignal.timeout(15_000) };
  const metadata = await fetch(EMPLOYMENT_URL, options);
  if (!metadata.ok) throw new Error(`Employment metadata request failed: ${metadata.status}.`);
  const table = await metadata.json() as { variables: { code: string; values: string[] }[] };
  const area = table.variables?.find((v) => v.code === AREA);
  const time = table.variables?.find((v) => v.code === TIME);
  if (!Array.isArray(area?.values) || !Array.isArray(time?.values)) throw new Error("Missing employment metadata.");
  if (!area.values.includes(code)) return [];
  const years = time.values.filter((y) => /^\d{4}$/.test(y) && Number(y) <= Number(selectedYear))
    .sort().slice(-6);
  if (!years.length) return [];
  const selections: Record<string, string[]> = {
    [AREA]: [code], [ACTIVITY]: ["11+12", "12"], [SEX]: ["SSS"],
    [AGE]: ["18-64"], [TIME]: years, [METRIC]: ["tyokay-vaesto"],
  };
  const response = await fetch(EMPLOYMENT_URL, {
    ...options, signal: AbortSignal.timeout(15_000), method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: Object.entries(selections).map(([variable, values]) => ({
      code: variable, selection: { filter: "item", values },
    })), response: { format: "json-stat2" } }),
  });
  if (!response.ok) throw new Error(`Employment request failed: ${response.status}.`);
  return parseEmployment(await response.json(), code, years);
}
