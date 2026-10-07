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

const { getMunicipalityCatalog, getPopulationSeries } = loadTs("src/lib/statfin.ts");
const { populationChange, populationCsv } = loadTs("src/lib/population.ts");
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

test("change handles decline, missing values, and a zero baseline", () => {
  assert.deepEqual(populationChange({ year: "2025", population: 90 }, { year: "2024", population: 100 }), { absolute: -10, percent: -10 });
  assert.deepEqual(populationChange({ year: "2025", population: 10 }, { year: "2024", population: 0 }), { absolute: 10, percent: null });
  assert.equal(populationChange({ year: "2025", population: 10 }), null);
});

test("CSV preserves Finnish text, escapes quotes, and leaves missing values blank", () => {
  assert.equal(populationCsv('Testi "kunta"', [{ year: "2024", population: null }, { year: "2025", population: 110 }]),
    '\uFEFFKunta;Vuosi;Väkiluku\r\n"Testi ""kunta""";2024;\r\n"Testi ""kunta""";2025;110');
});
