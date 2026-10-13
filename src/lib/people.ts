const BASE = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin";
const AREA = "alue_23_20260101";
const AGE = "ikaryhma_10_20180101";
const TIME = "timeperiod_y";
const SEX = "sukupuoli_9_20180101";
const EDUCATION = "koulutusaste_17_20180101";
const MARITAL = "siviilisaaty_16_20190101";

export const educationGroups = [
  { code: "9", label: "Ei perusasteen jälkeistä tutkintoa" },
  { code: "3", label: "Toinen aste" },
  { code: "4", label: "Erikoisammattikoulutusaste" },
  { code: "5", label: "Alin korkea-aste" },
  { code: "6", label: "Alempi korkeakouluaste" },
  { code: "7", label: "Ylempi korkeakouluaste" },
  { code: "8", label: "Tutkijakoulutusaste" },
];
export const maritalGroups = [
  { code: "1", label: "Naimaton" }, { code: "2", label: "Naimisissa" },
  { code: "4", label: "Eronnut" }, { code: "5", label: "Leski" },
];
type Dimension = { category: { index: string[] | Record<string, number> }; note?: string[] };
type Dataset = { id: string[]; size: number[]; dimension: Record<string, Dimension>; value: (number | null)[] };
type Metadata = { variables: { code: string; values: string[] }[] };
export type PeopleProfile = {
  year: string; total: number | null;
  groups: { code: string; label: string; count: number | null; share: number | null }[];
};

// Resolve each cell through the returned dimension indexes; never assume API order.
export function parsePeopleCounts(data: Dataset, selections: Record<string, string[]>, category: string, year?: string) {
  if (year !== undefined && !selections[TIME]?.includes(year)) throw new Error("Unexpected resident year");
  const ids = Object.keys(selections);
  if (!data || !Array.isArray(data.id) || new Set(data.id).size !== ids.length || data.id.length !== ids.length ||
      !Array.isArray(data.size) || data.size.length !== ids.length || !Array.isArray(data.value) ||
      data.size.reduce((a, b) => a * b, 1) !== data.value.length) throw new Error("Unexpected resident profile dimensions");
  const indexes = data.id.map((id, i) => {
    const requested = selections[id];
    const index = data.dimension?.[id]?.category?.index;
    if (!requested || !index || data.size[i] !== requested.length || Object.keys(index).length !== requested.length) {
      throw new Error("Unexpected resident profile categories");
    }
    const positions = requested.map((key) => Array.isArray(index) ? index.indexOf(key) : index[key]);
    if (new Set(positions).size !== positions.length || positions.some((position) => !Number.isInteger(position) || position < 0 || position >= requested.length)) {
      throw new Error("Invalid resident profile index");
    }
    return Object.fromEntries(requested.map((key, n) => [key, positions[n]]));
  });
  const totals: Record<string, number | null> = {};
  function visit(dimension: number, offset: number, group: string) {
    if (dimension === data.id.length) {
      const value = data.value[offset];
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid resident count");
      totals[group] = value === null || totals[group] === null ? null : (totals[group] ?? 0) + value;
      return;
    }
    const id = data.id[dimension];
    for (const key of year && id === TIME ? [year] : selections[id]) visit(dimension + 1, offset * data.size[dimension] + indexes[dimension][key], id === category ? key : group);
  }
  if (!selections[category]?.includes("SSS")) throw new Error("Missing resident profile total");
  visit(0, 0, "");
  const parts = selections[category].filter((key) => key !== "SSS").map((key) => totals[key]);
  if (totals.SSS !== null) {
    if (parts.some((value) => value !== null && value > totals.SSS!)) throw new Error("Resident count exceeds total");
    if (parts.every((value) => value !== null) && parts.reduce<number>((sum, value) => sum + value!, 0) !== totals.SSS) {
      throw new Error("Resident categories do not reconcile");
    }
  }
  return totals;
}

async function getPeopleProfiles(kind: "education" | "marital", code: string, selectedYear: string, count: number): Promise<PeopleProfile[]> {
  if (!/^KU\d{3}$/.test(code) || !/^\d{4}$/.test(selectedYear)) throw new Error("Invalid resident profile selection");
  const url = `${BASE}/${kind === "education" ? "vkour/12bq" : "vaerak/11rz"}.px`;
  const options = { cache: "force-cache" as const, next: { revalidate: 86400 } };
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Resident metadata failed: ${response.status}`);
  const metadata = await response.json() as Metadata;
  const variable = (id: string) => metadata.variables?.find((item) => item.code === id)?.values;
  const years = variable(TIME)?.filter((item) => /^\d{4}$/.test(item) && Number(item) <= Number(selectedYear)).sort().slice(-count) ?? [];
  if (!years.length || !variable(AREA)?.includes(code)) return [];
  const definitions = kind === "education" ? educationGroups : maritalGroups;
  const category = kind === "education" ? EDUCATION : MARITAL;
  const ages = kind === "education" ? ["SSS"] : [...Array.from({ length: 82 }, (_, i) => String(i + 18).padStart(3, "0")), "100-"];
  const selections: Record<string, string[]> = {
    [AREA]: [code], [TIME]: years, [SEX]: ["SSS"], [AGE]: ages,
    [category]: ["SSS", ...definitions.map((item) => item.code)],
    contentscode: [kind === "education" ? "vaesto_15_" : "vaerak-vaesto"],
    ...(kind === "marital" ? { kieli_15_20180102: ["SSS"] } : {}),
  };
  for (const [id, values] of Object.entries(selections)) {
    if (values.some((value) => !variable(id)?.includes(value))) throw new Error(`Missing resident category ${id}`);
  }
  const dataResponse = await fetch(url, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ query: Object.entries(selections).map(([id, values]) => ({ code: id, selection: { filter: "item", values } })), response: { format: "json-stat2" } }),
  });
  if (!dataResponse.ok) throw new Error(`Resident data failed: ${dataResponse.status}`);
  const data = await dataResponse.json();
  return years.map((year) => {
    const totals = parsePeopleCounts(data, selections, category, year);
    const total = totals.SSS;
    return { year, total, groups: definitions.map((item) => ({ ...item, count: totals[item.code],
      share: totals[item.code] === null || total === null || total === 0 ? null : totals[item.code]! / total * 100 })) };
  });
}

export async function getPeopleProfile(kind: "education" | "marital", code: string, selectedYear: string): Promise<PeopleProfile | null> {
  return (await getPeopleProfiles(kind, code, selectedYear, 1))[0] ?? null;
}

export function higherEducationShare(profile: PeopleProfile | null): number | null {
  if (!profile || !profile.total) return null;
  const values = ["5", "6", "7", "8"].map((code) => profile.groups.find((group) => group.code === code)?.count);
  return values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0) / profile.total * 100;
}

export async function getEducationTrend(code: string, year: string) {
  return (await getPeopleProfiles("education", code, year, 10)).map((profile) => ({ year: profile.year, value: higherEducationShare(profile) }));
}
