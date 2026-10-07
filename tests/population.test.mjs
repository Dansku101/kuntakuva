import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Transpile in memory so tests need neither a new runner nor generated files.
function loadTs(relativePath) {
  const filename = path.resolve(testDirectory, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { getMunicipalityCatalog, getPopulationSeries, getDemographicProfile, demographicIndicators } = loadTs("src/lib/statfin.ts");
const { populationChange, populationCsv, relativePopulationPoints } = loadTs("src/lib/population.ts");
const { accountsFields, parseAccountsFacts, selectAccountsDataset, getMunicipalityAccounts, expenseShares, perResidentAmount, depreciationCoverage } = loadTs("src/lib/finance.ts");
const { parseEmployment, getEmploymentTrend } = loadTs("src/lib/employment.ts");
const { fiveYearPopulationChange, percentagePointChange } = loadTs("src/lib/trends.ts");
const areaCode = "alue_23_20260101";
const yearCode = "timeperiod_y";

function dataset(overrides = {}) {
  return {
    id: [areaCode, "contentscode", yearCode],
    size: [1, 1, 2],
    source: "Tilastokeskus",
    updated: "2026-05-29T05:00:00Z",
    dimension: {
      [areaCode]: { category: { index: { KU091: 0 }, label: { KU091: "Helsinki" } } },
      [yearCode]: { category: { index: { "2024": 0, "2025": 1 }, label: { "2024": "2024", "2025": "2025" } } },
    },
    value: [100, 110],
    ...overrides,
  };
}

function mockResponse(t, data) {
  return t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => data }));
}

function accountsFacts(overrides = {}) {
  return Object.entries(accountsFields).map(([key, id]) => ({
    ytunnus: "0203026-2", raportointikausi: "2025C12", raportointikokonaisuus: "KKNR",
    osakokonaisuus: key === "investments" ? "k-t13" : "k-t07",
    taksonomia: "jhs-2018-01/2024-03-26", tunnusluku: id,
    arvo: key === "surplus" ? "-127292.31" : "100.00", ...overrides,
  }));
}

test("audited field IDs remain pinned to the official statement aggregates", () => {
  assert.deepEqual(accountsFields, {
    operatingRevenue: "3319283", operatingExpenses: "3418067", taxRevenue: "3460403",
    stateTransfers: "3530963", personnel: "1562", services: "699", materials: "683",
    grants: "3432179", otherExpenses: "3446291", annualResult: "159456", surplus: "1447",
    annualMargin: "1400", depreciation: "1470", investments: "1374",
  });
});

test("actual accounts preserve signed amounts and distinct before/after-transfer results", () => {
  const facts = accountsFacts();
  facts.find((f) => f.tunnusluku === accountsFields.annualResult).arvo = "999.00";
  facts.find((f) => f.tunnusluku === accountsFields.stateTransfers).arvo = "-180000.00";
  const v = parseAccountsFacts(facts.reverse(), "0203026-2", "2025");
  assert.equal(v.surplus, -127292.31);
  assert.equal(v.annualResult, 999);
  assert.equal(v.stateTransfers, -180000);
});

test("Espoo and Kauniainen actual 2025 snapshots reconcile expenses and result definitions", () => {
  const snapshots = [
    { id: "0101263-6", operatingExpenses: 1417999125.41, personnel: 607671414.12,
      services: 497113626.98, materials: 57875800.06, grants: 107664599.59,
      otherExpenses: 147673684.66, annualResult: 110818200.18, surplus: 126585792.48,
      annualMargin: 315934392.27, depreciation: 205116192.09, investments: 341774185.14 },
    { id: "0203026-2", operatingExpenses: 53367958.79, personnel: 32952356.71,
      services: 12047292.86, materials: 4948030.41, grants: 2107935.79,
      otherExpenses: 1312343.02, annualResult: 909641.21, surplus: 909641.21,
      annualMargin: 10658434.20, depreciation: 9748792.99, investments: 14322882.56 },
  ];
  for (const snapshot of snapshots) {
    const facts = accountsFacts({ ytunnus: snapshot.id }).map((f) => {
      const key = Object.keys(accountsFields).find((key) => accountsFields[key] === f.tunnusluku);
      return { ...f, arvo: String(snapshot[key] ?? 100) };
    });
    const v = parseAccountsFacts(facts, snapshot.id, "2025");
    assert.equal(v.annualResult, snapshot.annualResult);
    assert.equal(v.surplus, snapshot.surplus);
    assert.equal(v.investments, snapshot.investments);
    assert.ok(Math.abs(expenseShares(v).reduce((a, b) => a + b, 0) - 100) < 1e-9);
    assert.equal(depreciationCoverage(v), snapshot.annualMargin / snapshot.depreciation * 100);
  }
});

test("Kauniainen 2024 negative actual surplus is not a forecast or budget overspend", () => {
  const facts = accountsFacts({ raportointikausi: "2024C12", taksonomia: "jhs-2018-01/2023-04-02" });
  assert.equal(parseAccountsFacts(facts, "0203026-2", "2024").surplus, -127292.31);
});

test("missing accounts remain null; zero is not treated as absent", () => {
  const facts = accountsFacts().filter((f) => f.tunnusluku !== accountsFields.investments);
  facts.find((f) => f.tunnusluku === accountsFields.surplus).arvo = "0.00";
  const v = parseAccountsFacts(facts, "0203026-2", "2025");
  assert.equal(v.investments, null);
  assert.equal(v.surplus, 0);
});

test("accounts reject budgets, forecasts, groups, partial years and unknown taxonomies", () => {
  for (const overrides of [{ ytunnus: "0101263-6" }, { raportointikausi: "2025C09" },
    { raportointikausi: "2024C12" }, { raportointikokonaisuus: "KTAS" },
    { raportointikokonaisuus: "KKTPA" }, { raportointikokonaisuus: "KKOTR" },
    { taksonomia: "unknown" }, { arvo: "NaN" }, { arvo: "1,234" }]) {
    assert.throws(() => parseAccountsFacts(accountsFacts(overrides), "0203026-2", "2025"));
  }
  assert.throws(() => parseAccountsFacts([...accountsFacts(), accountsFacts()[0]], "0203026-2", "2025"), /Duplicate/);
  const wrongTable = accountsFacts().map((f) => ({ ...f, osakokonaisuus: "k-t09" }));
  assert.equal(parseAccountsFacts(wrongTable, "0203026-2", "2025").operatingExpenses, null);
});

test("expense shares require complete nonnegative figures reconciled to cents", () => {
  const v = parseAccountsFacts(accountsFacts(), "0203026-2", "2025");
  const reconciled = { ...v, operatingExpenses: 500 };
  assert.deepEqual(expenseShares(reconciled), [20, 20, 20, 20, 20]);
  for (const change of [{ personnel: null }, { personnel: -100 }, { personnel: Infinity },
    { operatingExpenses: 500.06 }, { operatingExpenses: 0 }]) {
    assert.equal(expenseShares({ ...reconciled, ...change }), null);
  }
});

test("coverage and per-resident calculations preserve signs and reject invalid denominators", () => {
  const v = parseAccountsFacts(accountsFacts(), "0203026-2", "2025");
  assert.equal(depreciationCoverage({ ...v, annualMargin: -100, depreciation: 200 }), -50);
  for (const depreciation of [0, -1, null, Infinity]) {
    assert.equal(depreciationCoverage({ ...v, depreciation }), null);
  }
  assert.equal(perResidentAmount(-180000, 10000), -18);
  assert.equal(perResidentAmount(0, 10000), 0);
  for (const population of [null, 0, -1, Infinity]) assert.equal(perResidentAmount(100, population), null);
});

test("accounts catalog only selects latest final year-end version", () => {
  const base = { ytunnus: "0203026-2", raportointikausi: "2025C12", raportointikokonaisuus: "KKNR",
    hyvaksymisvaihe: "Lopullinen", hyvaksymispvm: "2026-01-01 10:00:00" };
  const corrected = { ...base, hyvaksymisvaihe: "Jälkikorjattu", hyvaksymispvm: "2026-02-01 10:00:00" };
  assert.deepEqual(selectAccountsDataset([base, corrected,
    { ...corrected, raportointikausi: "2025C09" },
    { ...corrected, raportointikokonaisuus: "KKTPA" },
    { ...corrected, hyvaksymisvaihe: "Alustava" }], "0203026-2", "2025"), corrected);
  assert.equal(selectAccountsDataset([base], "0203026-2", "2024"), null);
});

test("finance rejects invalid input; unverified years never fetch forecasts", async (t) => {
  const mocked = mockResponse(t, {});
  await assert.rejects(getMunicipalityAccounts("KU../", "2025"), /Invalid/);
  await assert.rejects(getMunicipalityAccounts("KU235", "2025C12"), /Invalid/);
  assert.equal(await getMunicipalityAccounts("KU235", "2020"), null);
  assert.equal(mocked.mock.calls.length, 0);
});

test("finance resolves business ID and uses corrected year-end actuals", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    const data = url.includes("/Kunta(") ? { Kunta_Id: 235, YTunnus: "0203026-2" }
      : url.endsWith("/aineistot") ? { aineistot: [{ ytunnus: "0203026-2", raportointikausi: "2025C12",
        raportointikokonaisuus: "KKNR", hyvaksymisvaihe: "Jälkikorjattu", hyvaksymispvm: "2026-02-01 10:00:00" }] }
      : accountsFacts();
    return { ok: true, json: async () => data };
  });
  const result = await getMunicipalityAccounts("KU235", "2025");
  assert.equal(result.corrected, true);
  assert.equal(result.publishedAt, "2026-02-01");
  assert.ok(calls[2].endsWith("/jalkikorjattu/KKNR/0203026-2/2025C12"));
  assert.equal(await getMunicipalityAccounts("KU235", "2024"), null);
});

test("trend comparisons use exact five-year endpoints and consecutive financial/employment years", () => {
  assert.equal(fiveYearPopulationChange([{ year: "2020", population: 100 }, { year: "2025", population: 110 }], "2025"), 10);
  assert.equal(fiveYearPopulationChange([{ year: "2021", population: 100 }, { year: "2025", population: 110 }], "2025"), null);
  assert.equal(fiveYearPopulationChange([{ year: "2020", population: 0 }, { year: "2025", population: 110 }], "2025"), null);
  assert.equal(percentagePointChange({ year: "2025", value: 9 }, { year: "2024", value: 10 }), -1);
  assert.equal(percentagePointChange({ year: "2025", value: 9 }, { year: "2023", value: 10 }), null);
  assert.equal(percentagePointChange({ year: "2025", value: null }, { year: "2024", value: 10 }), null);
});

function employmentData() {
  const selections = {
    timeperiod_y: ["2024", "2023"], paaasial_toimin_3_20180101: ["12", "11+12"],
    alue_23_20250101: ["KU049"], sukupuoli_9_20180101: ["SSS"],
    ikaryhma_10_20180101: ["18-64"], contentscode: ["tyokay-vaesto"],
  };
  return { id: Object.keys(selections), size: [2, 2, 1, 1, 1, 1], value: [12, 100, 10, 100],
    dimension: Object.fromEntries(Object.entries(selections).map(([key, index]) => [key, { category: { index } }])) };
}

test("employment uses returned dimension order and year/category indexes", () => {
  assert.deepEqual(parseEmployment(employmentData(), "KU049", ["2023", "2024"]),
    [{ year: "2023", unemploymentRate: 10 }, { year: "2024", unemploymentRate: 12 }]);
});

test("employment preserves missing counts and rejects mismatched region, ages, and invalid counts", () => {
  const data = employmentData();
  data.value[0] = null;
  assert.equal(parseEmployment(data, "KU049", ["2023", "2024"])[1].unemploymentRate, null);
  assert.throws(() => parseEmployment(data, "KU235", ["2023", "2024"]), /dimensions/);
  const duplicates = employmentData();
  duplicates.dimension.timeperiod_y.category.index = { "2023": 0, "2024": 0 };
  assert.throws(() => parseEmployment(duplicates, "KU049", ["2023", "2024"]), /dimensions/);
  for (const amount of [-1, 101, 1.5]) {
    const invalid = employmentData();
    invalid.value[0] = amount;
    assert.throws(() => parseEmployment(invalid, "KU049", ["2023", "2024"]));
  }
});

test("employment selects latest published year not later than selection, with explicit older year", async (t) => {
  const data = employmentData();
  let query;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.method === "POST") {
      query = JSON.parse(options.body);
      return { ok: true, json: async () => data };
    }
    return { ok: true, json: async () => ({ variables: [
      { code: "alue_23_20250101", values: ["KU049"] },
      { code: "timeperiod_y", values: ["2026", "2024", "2023"] },
    ] }) };
  });
  const points = await getEmploymentTrend("KU049", "2025");
  assert.equal(points.at(-1).year, "2024");
  assert.deepEqual(query.query.find((v) => v.code === "timeperiod_y").selection.values, ["2023", "2024"]);
});

test("catalog keeps municipality codes, sorts Finnish names, and reads available years", async (t) => {
  mockResponse(t, { variables: [
    { code: areaCode, values: ["SSS", "KU091", "KU049", "MK01"], valueTexts: ["Suomi", "Helsinki", "Espoo", "Uusimaa"] },
    { code: yearCode, values: ["2025", "2024"], valueTexts: ["2025", "2024"] },
  ] });
  assert.deepEqual(await getMunicipalityCatalog(), {
    municipalities: [{ code: "KU049", name: "Espoo" }, { code: "KU091", name: "Helsinki" }],
    years: ["2024", "2025"],
  });
});

test("malformed catalog fails before mismatched names can be displayed", async (t) => {
  mockResponse(t, { variables: [{ code: areaCode, values: ["KU091"], valueTexts: [] }] });
  await assert.rejects(getMunicipalityCatalog(), /metadata is missing/);
});

test("population values use returned year indexes rather than request order", async (t) => {
  const fetchMock = mockResponse(t, dataset());
  const result = await getPopulationSeries("KU091", ["2025", "2024"]);
  assert.deepEqual(result.points, [{ year: "2024", population: 100 }, { year: "2025", population: 110 }]);
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.deepEqual(body.query[2].selection.values, ["2025", "2024"]);
});

test("array-form JSON-stat indexes and null values are supported", async (t) => {
  const data = dataset({ value: [null, 110] });
  data.dimension[yearCode].category.index = ["2024", "2025"];
  mockResponse(t, data);
  const result = await getPopulationSeries("KU091", ["2024", "2025"]);
  assert.equal(result.points[0].population, null);
  assert.equal(populationChange(result.points[1], result.points[0]), null);
});

test("additional areas cannot silently corrupt a population series", async (t) => {
  mockResponse(t, dataset({ size: [2, 1, 2], value: [100, 110, 200, 220] }));
  await assert.rejects(getPopulationSeries("KU091", ["2024", "2025"]), /unexpected population dimensions/);
});

test("missing requested years and invalid population numbers are rejected", async (t) => {
  mockResponse(t, dataset({ value: [100, -10] }));
  await assert.rejects(getPopulationSeries("KU091", ["2024", "2025"]), /unexpected value/);
  await assert.rejects(getPopulationSeries("KU091", ["2023", "2024"]), /unexpected value/);
});

test("failed API responses propagate to the page error boundary", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  await assert.rejects(getPopulationSeries("KU091", ["2025"]), /503/);
});

test("demographic values follow returned metric indexes, preserving missing values", async (t) => {
  const codes = Object.values(demographicIndicators).reverse();
  const data = dataset({
    size: [1, codes.length, 1],
    value: [3000, 20, 5, 75, 40, 20, 65, null],
  });
  data.dimension.contentscode = { category: { index: codes, label: Object.fromEntries(codes.map((code) => [code, code])) } };
  mockResponse(t, data);
  const result = await getDemographicProfile("KU091", "2025");
  assert.deepEqual(result.values, { children: null, workingAge: 65, seniors: 20, averageAge: 40,
    finnish: 75, swedish: 5, otherLanguages: 20, density: 3000 });
  assert.equal(result.year, "2025");
});

test("demographics reject extra regions rather than assigning their data to the municipality", async (t) => {
  const codes = Object.values(demographicIndicators);
  const data = dataset({ size: [2, codes.length, 1], value: Array(16).fill(10) });
  data.dimension.contentscode = { category: { index: codes, label: {} } };
  mockResponse(t, data);
  await assert.rejects(getDemographicProfile("KU091", "2025"), /dimensions/);
});

test("change handles decline, missing values, and a zero baseline", () => {
  assert.deepEqual(populationChange({ year: "2025", population: 90 }, { year: "2024", population: 100 }), { absolute: -10, percent: -10 });
  assert.deepEqual(populationChange({ year: "2025", population: 10 }, { year: "2024", population: 0 }), { absolute: 10, percent: null });
  assert.equal(populationChange({ year: "2025", population: 10 }), null);
});

test("relative growth uses the selected start year as a zero baseline", () => {
  const small = [{ year: "2024", population: 10000 }, { year: "2025", population: 11000 }];
  const large = [{ year: "2024", population: 300000 }, { year: "2025", population: 330000 }];
  assert.deepEqual(relativePopulationPoints(small, "2024"), relativePopulationPoints(large, "2024"));
  assert.equal(relativePopulationPoints(small, "2024")[1].population, 10);
  assert.equal(relativePopulationPoints(small, "2025")[1].population, 0);
});

test("relative growth preserves gaps and rejects missing or zero baselines", () => {
  const points = [{ year: "2023", population: 0 }, { year: "2024", population: 100 },
    { year: "2025", population: null }, { year: "2026", population: 90 }];
  assert.deepEqual(relativePopulationPoints(points, "2024").map((point) => point.population), [null, 0, null, -10]);
  assert.ok(relativePopulationPoints(points, "2023").every((point) => point.population === null));
  assert.ok(relativePopulationPoints(points).every((point) => point.population === null));
});

test("CSV preserves Finnish text, escapes quotes, and leaves missing values blank", () => {
  assert.equal(populationCsv('Testi "kunta"', [{ year: "2024", population: null }, { year: "2025", population: 110 }]),
    '\uFEFFKunta;Vuosi;Väkiluku\r\n"Testi ""kunta""";2024;\r\n"Testi ""kunta""";2025;110');
});
