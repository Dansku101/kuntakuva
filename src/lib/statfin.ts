const STATFIN_POPULATION_URL =
  "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak/11ra.px";

// The table uses the 2026 regional classification for its entire time series.
const AREA_VARIABLE_CODE = "alue_23_20260101";
const CONTENTS_VARIABLE_CODE = "contentscode";
const POPULATION_VALUE_CODE = "vaerak-vaesto";
const YEAR_VARIABLE_CODE = "timeperiod_y";

export type Municipality = { code: string; name: string };
export type MunicipalityCatalog = { municipalities: Municipality[]; years: string[] };
export type PopulationPoint = { year: string; population: number | null };
export type PopulationSeries = {
  municipalityCode: string;
  municipalityName: string;
  points: PopulationPoint[];
  source: string;
  updatedAt: string;
  regionalNote: string;
};
export type MunicipalityPopulation = {
  municipalityCode: string;
  municipalityName: string;
  year: string;
  population: number;
  source: string;
  updatedAt: string;
};
type PxWebVariable = { code: string; values: string[]; valueTexts: string[] };
type PxWebMetadataResponse = { variables: PxWebVariable[] };
type JsonStatDimension = {
  note?: string[];
  category: {
    index: Record<string, number> | string[];
    label: Record<string, string>;
  };
};
type JsonStatResponse = {
  id: string[];
  size: number[];
  source?: string;
  updated?: string;
  dimension: Record<string, JsonStatDimension>;
  value: Array<number | null>;
};

function getVariable(data: PxWebMetadataResponse, code: string) {
  const variable = Array.isArray(data.variables)
    ? data.variables.find((item) => item.code === code)
    : undefined;
  if (!variable || !Array.isArray(variable.values) || !Array.isArray(variable.valueTexts) ||
      variable.values.length !== variable.valueTexts.length) {
    throw new Error(`Statistics Finland metadata is missing variable ${code}.`);
  }
  return variable;
}

export async function getMunicipalityCatalog(): Promise<MunicipalityCatalog> {
  const response = await fetch(STATFIN_POPULATION_URL, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Statistics Finland metadata request failed: ${response.status}.`);
  const data = (await response.json()) as PxWebMetadataResponse;
  const areas = getVariable(data, AREA_VARIABLE_CODE);
  const municipalities = areas.values.flatMap((code, index) => {
    if (!/^KU\d{3}$/.test(code)) return [];
    const name = areas.valueTexts[index];
    if (!name) throw new Error(`Statistics Finland is missing the name for ${code}.`);
    return [{ code, name }];
  });
  const years = getVariable(data, YEAR_VARIABLE_CODE).values
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => Number(a) - Number(b));
  if (!municipalities.length || !years.length) throw new Error("Statistics Finland returned an empty catalog.");
  municipalities.sort((a, b) => a.name.localeCompare(b.name, "fi"));
  return { municipalities, years };
}

export async function getMunicipalities(): Promise<Municipality[]> {
  return (await getMunicipalityCatalog()).municipalities;
}

export async function getPopulationSeries(municipalityCode: string, years: string[]): Promise<PopulationSeries> {
  if (!years.length || new Set(years).size !== years.length) throw new Error("A population query requires unique years.");
  const response = await fetch(STATFIN_POPULATION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: AREA_VARIABLE_CODE, selection: { filter: "item", values: [municipalityCode] } },
        { code: CONTENTS_VARIABLE_CODE, selection: { filter: "item", values: [POPULATION_VALUE_CODE] } },
        { code: YEAR_VARIABLE_CODE, selection: { filter: "item", values: years } },
      ],
      response: { format: "json-stat2" },
    }),
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Statistics Finland population request failed: ${response.status}.`);
  const data = (await response.json()) as JsonStatResponse;
  const area = data.dimension?.[AREA_VARIABLE_CODE];
  const time = data.dimension?.[YEAR_VARIABLE_CODE];
  const municipalityName = area?.category.label[municipalityCode];
  const timePosition = data.id?.indexOf(YEAR_VARIABLE_CODE) ?? -1;
  if (!municipalityName || !time || timePosition < 0 ||
      !Array.isArray(data.value) || !Array.isArray(data.size) ||
      data.id.length !== data.size.length ||
      data.size.some((size, index) => index !== timePosition && size !== 1) ||
      data.size[timePosition] !== years.length) {
    throw new Error("Statistics Finland returned unexpected population dimensions.");
  }
  // With one area and one metric, API time indexes locate values regardless of request order.
  const points = years.map((year) => {
    const index = Array.isArray(time.category.index)
      ? time.category.index.indexOf(year)
      : time.category.index[year];
    const population = data.value[index];
    if (!Number.isInteger(index) || index < 0 ||
        (population !== null && (typeof population !== "number" || !Number.isFinite(population) || population < 0))) {
      throw new Error(`Statistics Finland returned an unexpected value for ${year}.`);
    }
    return { year, population };
  }).sort((a, b) => Number(a.year) - Number(b.year));
  return {
    municipalityCode,
    municipalityName,
    points,
    source: data.source ?? "Tilastokeskus, väestörakenne",
    updatedAt: data.updated ?? "",
    regionalNote: area.note?.[0] ?? "",
  };
}

export async function getMunicipalityPopulation(municipalityCode: string, year: string): Promise<MunicipalityPopulation> {
  const series = await getPopulationSeries(municipalityCode, [year]);
  const population = series.points[0].population;
  if (population === null) throw new Error("Population data is missing for the selected year.");
  return {
    municipalityCode, municipalityName: series.municipalityName, year, population,
    source: series.source, updatedAt: series.updatedAt,
  };
}
