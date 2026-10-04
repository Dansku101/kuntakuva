const STATFIN_POPULATION_URL =
  "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak/11ra.px";

// The variable code includes Statistics Finland's 2026 regional classification date.
const AREA_VARIABLE_CODE = "alue_23_20260101";
const CONTENTS_VARIABLE_CODE = "contentscode";
const POPULATION_VALUE_CODE = "vaerak-vaesto";
const YEAR_VARIABLE_CODE = "timeperiod_y";

export type Municipality = {
  code: string;
  name: string;
};

export type MunicipalityPopulation = {
  municipalityCode: string;
  municipalityName: string;
  year: string;
  population: number;
  source: string;
  updatedAt: string;
};

type PxWebVariable = {
  code: string;
  values: string[];
  valueTexts: string[];
};

type PxWebMetadataResponse = {
  variables: PxWebVariable[];
};

// This is the small subset of JSON-stat2 metadata that Kuntakuva reads.
type JsonStatDimension = {
  category: {
    label: Record<string, string>;
  };
};

type JsonStatResponse = {
  source?: string;
  updated?: string;
  dimension: Record<string, JsonStatDimension>;
  value: Array<number | null>;
};

function parseMunicipalities(
  data: PxWebMetadataResponse,
): Municipality[] {
  const areaVariable = data.variables.find(
    (variable) => variable.code === AREA_VARIABLE_CODE,
  );

  if (!areaVariable) {
    throw new Error("Statistics Finland metadata is missing the area variable.");
  }

  return areaVariable.values.flatMap((code, index) => {
    if (!code.startsWith("KU")) {
      return [];
    }

    const name = areaVariable.valueTexts[index];

    if (!name) {
      throw new Error(`Statistics Finland metadata is missing a name for ${code}.`);
    }

    return [{ code, name }];
  });
}

function createPopulationQuery(municipalityCode: string, year: string) {
  return {
    query: [
      {
        code: AREA_VARIABLE_CODE,
        selection: {
          filter: "item",
          values: [municipalityCode],
        },
      },
      {
        code: CONTENTS_VARIABLE_CODE,
        selection: {
          filter: "item",
          values: [POPULATION_VALUE_CODE],
        },
      },
      {
        code: YEAR_VARIABLE_CODE,
        selection: {
          filter: "item",
          values: [year],
        },
      },
    ],
    response: {
      format: "json-stat2",
    },
  };
}

/** Fetches one municipality's year-end population from Statistics Finland. */
export async function getMunicipalityPopulation(
  municipalityCode: string,
  year: string,
): Promise<MunicipalityPopulation> {
  const response = await fetch(STATFIN_POPULATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createPopulationQuery(municipalityCode, year)),
    // Population data changes infrequently, so reuse a response for up to one day.
    cache: "force-cache",
    next: {
      revalidate: 60 * 60 * 24,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Statistics Finland request failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as JsonStatResponse;
  const population = data.value[0];
  const municipalityName =
    data.dimension[AREA_VARIABLE_CODE]?.category.label[municipalityCode];

  if (typeof population !== "number" || !municipalityName) {
    throw new Error("Statistics Finland returned an unexpected response.");
  }

  return {
    municipalityCode,
    municipalityName,
    year,
    population,
    source: data.source ?? "Tilastokeskus, väestörakenne",
    updatedAt: data.updated ?? "",
  };
}

export async function getMunicipalities(): Promise<Municipality[]> {
  const response = await fetch(STATFIN_POPULATION_URL, {
    cache: "force-cache",
    next: {
      revalidate: 60 * 60 * 24,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Statistics Finland metadata request failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as PxWebMetadataResponse;

  return parseMunicipalities(data);
}
