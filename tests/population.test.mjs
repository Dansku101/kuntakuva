import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { createElement, Suspense } from "react";
import { renderToString } from "react-dom/server";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

// Transpile in memory so tests need neither a new runner nor generated files.
function loadTs(relativePath, overrides = {}) {
  const filename = path.resolve(testDirectory, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    const local = specifier.startsWith("@/") ? path.resolve(testDirectory, "../src", specifier.slice(2))
      : specifier.startsWith(".") ? path.resolve(path.dirname(filename), specifier) : null;
    if (local) for (const ext of [".ts", ".tsx"]) {
      if (fs.existsSync(local + ext)) return loadTs(path.relative(path.resolve(testDirectory, ".."), local + ext), overrides);
    }
    return nativeRequire(specifier);
  };
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { getMunicipalityCatalog, getPopulationSeries, getDemographicProfile, demographicIndicators } = loadTs("src/lib/statfin.ts");
const { populationChange, populationCsv, relativePopulationPoints } = loadTs("src/lib/population.ts");
const { accountsFields, parseAccountsFacts, selectAccountsDataset, getMunicipalityAccounts, expenseShares, perResidentAmount, depreciationCoverage, incomeStatementTotals } = loadTs("src/lib/finance.ts");
const { parseEmployment, getEmploymentTrend } = loadTs("src/lib/employment.ts");
const { fiveYearPopulationChange, percentagePointChange } = loadTs("src/lib/trends.ts");
const { searchMunicipalities, matchesMunicipalityName } = loadTs("src/lib/municipality-search.ts");
const { default: TrendSeries } = loadTs("src/app/trend-series.tsx");
const { parsePeopleCounts, getPeopleProfile, getEducationTrend, higherEducationShare } = loadTs("src/lib/people.ts");
const { parseHeatingCounts, getHeatingProfile } = loadTs("src/lib/energy.ts");
const { parseClimateProfile, parseClimateTrend, getClimateProfile } = loadTs("src/lib/climate.ts");
const { commonProfiles, getComparison, getComparisonSections, loadComparisonSection } = loadTs("src/lib/comparison.ts");
const { sameFinancialArea, compatibleFinancialPopulation } = loadTs("src/lib/financial-geography.ts");
const { comparisonDifference } = loadTs("src/lib/comparison-difference.ts");

test("financial geography blocks mergers and partial transfers but keeps unaffected municipalities", () => {
  for (const code of ["KU507", "KU418", "KU837"]) {
    assert.equal(compatibleFinancialPopulation(code, "2024", 7057), null);
    assert.equal(compatibleFinancialPopulation(code, "2025", 7057), 7057);
    assert.equal(sameFinancialArea(code, "2024", "2025"), false);
  }
  for (const code of ["KU740", "KU046"]) {
    for (const year of ["2024", "2025"]) assert.equal(compatibleFinancialPopulation(code, year, 100), null);
    assert.equal(sameFinancialArea(code, "2024", "2025"), true);
  }
  assert.equal(compatibleFinancialPopulation("KU235", "2024", 100), 100);
  assert.equal(compatibleFinancialPopulation("KU235", "2024", null), null);
  assert.equal(compatibleFinancialPopulation("KU235", "2026", 100), null);
  assert.equal(sameFinancialArea("KU235", "unknown", "2025"), false);
});

test("finance display and comparison both suppress mismatched per-resident amounts", async () => {
  const values = Object.fromEntries(Object.keys(accountsFields).map((key) => [key, 0]));
  Object.assign(values, { taxRevenue: 20740000, operatingExpenses: 19750000, annualResult: 990000 });
  const finance = { incomeStatementTotals, perResidentAmount, expenseShares,
    getMunicipalityAccounts: async (_code, year) => ({ year, values, sourceUrl: "https://example.test/accounts" }) };
  const { getComparisonGroup } = loadTs("src/lib/comparison.ts", { "./finance": finance,
    "./statfin": { getPopulationSeries: async (_code, [year]) => ({ points: [{ year, population: 7057 }] }) } });
  const group = await getComparisonGroup("finance", ["KU507", "KU235"], "2024");
  assert.equal(group.failed, false);
  assert.ok(group.rows.every((row) => row.values[0] === null && row.values[1] !== null));
  const { default: Finance } = loadTs("src/app/municipality-finance.tsx", { "@/lib/finance": finance });
  const html = renderToString(await Finance({ code: "KU507", name: "Mäntyharju", year: "2024", population: 7057 }));
  assert.match(html, /Asukaskohtaisia lukuja ei näytetä/);
  assert.match(html, /20,74 milj/);
  assert.match(html, /19,75 milj/);
  assert.doesNotMatch(html, /2[\s\u00a0]939/);
});

test("financial trend breaks retain both annual observations without joining different areas", () => {
  const html = renderToString(createElement(TrendSeries, { title: "Finance", unit: "%",
    points: [{ year: "2024", value: 20 }, { year: "2025", value: 30, breakBefore: true }],
    note: "", breakNote: "Kuntaraja muuttunut", source: "KKNR", sourceUrl: "https://example.test", color: "#387c99" }));
  assert.equal((html.match(/<polyline /g) ?? []).length, 2);
  assert.equal((html.match(/<circle /g) ?? []).length, 2);
  assert.match(html, /Kuntaraja muuttunut/);
});

test("overview withholds annual finance change across a merger but preserves current coverage", async () => {
  const { default: Trends } = loadTs("src/app/municipality-trends.tsx", {
    "@/lib/finance": { depreciationCoverage, getMunicipalityAccounts: async (_code, year) => ({ year,
      values: { annualMargin: year === "2025" ? 200 : 100, depreciation: 100 } }) },
    "@/lib/employment": { getEmploymentTrend: async () => [] },
  });
  const html = renderToString(await Trends({ year: "2025", series: { municipalityCode: "KU507", points: [] } }));
  assert.match(html, /200 %/);
  assert.match(html, /Kuntaraja muuttunut/);
  assert.doesNotMatch(html, /prosenttiyks\. vuodessa/);
  const unchanged = renderToString(await Trends({ year: "2025", series: { municipalityCode: "KU235", points: [] } }));
  assert.match(unchanged, /\+100 prosenttiyks\. vuodessa/);
});

test("comparison differences use peer minus primary, percentage points and no invented zeros", () => {
  const row = { label: "Test", year: "2025", unit: "%", values: [20, 30] };
  assert.deepEqual(comparisonDifference(row), { value: 10, unit: "prosenttiyks." });
  assert.equal(comparisonDifference({ ...row, values: [30, 20] }).value, -10);
  for (const unit of ["€/asukas", "asukasta", "GWh", "kt CO₂e", "vuotta"]) {
    assert.deepEqual(comparisonDifference({ ...row, unit, values: [0, 0] }), { value: 0, unit });
  }
  for (const change of [{ year: null }, { values: [null, 0] }, { values: [0, null] }, { values: [Infinity, 1] }]) {
    assert.equal(comparisonDifference({ ...row, ...change }).value, null);
  }
});

test("each comparison section has its own Suspense boundary and resolves before pending finance", async () => {
  let releaseFinance;
  const gate = new Promise((resolve) => { releaseFinance = resolve; });
  let financeReady = false;
  const sections = getComparisonSections(["KU499", "KU235"], "2025").map((section) => ({ ...section,
    load: section.id === "finance" ? async () => { await gate; financeReady = true; return []; }
      : async () => [{ label: "Ready", unit: "asukasta", year: "2025", values: [0, 10] }],
  }));
  const { default: Comparison } = loadTs("src/app/municipality-comparison.tsx", {
    "@/lib/comparison": { getComparisonSections: () => sections, loadComparisonSection },
  });
  const tree = Comparison({ primary: { code: "KU499", name: "Mustasaari" }, peer: { code: "KU235", name: "Kauniainen" }, year: "2025" });
  assert.equal(tree.props.children.length, 5);
  assert.ok(tree.props.children.every((child) => child.type === Suspense));
  const [population, , finance] = tree.props.children.map((child) => child.props.children);
  const pendingFinance = finance.type(finance.props);
  try {
    const ready = await population.type(population.props);
    assert.equal(ready.props.initialGroup.failed, false);
    assert.equal(ready.props.initialGroup.rows[0].values[0], 0);
    assert.equal(financeReady, false);
  } finally { releaseFinance(); await pendingFinance; }
});

test("targeted comparison retry calls only the requested loader and rejects invalid input", async () => {
  const calls = [];
  const { GET } = loadTs("src/app/api/comparison/route.ts", {
    "@/lib/comparison": { comparisonSectionIds: ["finance", "population"],
      getComparisonGroup: async (...args) => { calls.push(args); return { failed: false, rows: [] }; } },
  });
  const response = await GET(new Request("https://example.test/api/comparison?section=finance&kunta=KU499&vertaa=KU235&vuosi=2025"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(calls, [["finance", ["KU499", "KU235"], "2025"]]);
  for (const query of ["section=bogus", "section=finance&kunta=KU499&vertaa=KU499&vuosi=2025", "section=finance&kunta=KU499&vertaa=KU235&vuosi=2026"]) {
    assert.equal((await GET(new Request(`https://example.test/api/comparison?${query}`))).status, 400);
  }
  assert.equal(calls.length, 1);
});

test("failed comparison retries return a retryable status rather than empty success", async () => {
  const { GET } = loadTs("src/app/api/comparison/route.ts", {
    "@/lib/comparison": { comparisonSectionIds: ["finance"], getComparisonGroup: async () => ({ failed: true, rows: [] }) },
  });
  assert.equal((await GET(new Request("https://example.test/api/comparison?section=finance&kunta=KU499&vertaa=KU235&vuosi=2025"))).status, 503);
});

test("comparison aligns sparse publication years and never compares different years", async () => {
  const observations = { A: ["2020", "2022", "2025"], B: ["2020", "2023", "2026"] };
  const calls = [];
  const pair = await commonProfiles(async (code, cutoff) => {
    calls.push([code, cutoff]);
    const year = observations[code].filter((y) => y <= cutoff).at(-1);
    return year ? { year, value: code === "A" ? 0 : null } : null;
  }, ["A", "B"], "2025");
  assert.deepEqual(pair, [{ year: "2020", value: 0 }, { year: "2020", value: null }]);
  assert.ok(calls.every(([, y]) => y <= "2025"));
  assert.equal(await commonProfiles(async () => null, ["A", "B"], "1990"), null);
  await assert.rejects(commonProfiles(async () => ({ year: "2026" }), ["A", "B"], "2025"), /Invalid comparison year/);
});

test("comparison source outages remain isolated to their sections", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  t.mock.method(console, "warn", () => {});
  const groups = await getComparison(["KU499", "KU235"], "2023");
  assert.equal(groups.length, 5);
  assert.ok(groups.filter((g) => g.title !== "Talous").every((g) => g.failed));
  const finance = groups.find((g) => g.title === "Talous");
  assert.equal(finance.failed, false);
  assert.ok(finance.rows.every((r) => r.year === null && r.values.every((v) => v === null)));
});

test("education history batches years and follows reversed year and category indexes", async (t) => {
  const category = "koulutusaste_17_20180101";
  const variables = [
    { code: "alue_23_20260101", values: ["KU499"] },
    { code: "timeperiod_y", values: ["2023", "2024", "2026"] },
    { code: "sukupuoli_9_20180101", values: ["SSS"] },
    { code: "ikaryhma_10_20180101", values: ["SSS"] },
    { code: category, values: ["SSS", "9", "3", "4", "5", "6", "7", "8"] },
    { code: "contentscode", values: ["vaesto_15_"] },
  ];
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (!options.body) return Response.json({ variables });
    posts++;
    const query = JSON.parse(options.body).query;
    assert.deepEqual(query.find((q) => q.code === "timeperiod_y").selection.values, ["2023", "2024"]);
    const ids = [category, "timeperiod_y", ...query.map((q) => q.code).filter((id) => ![category, "timeperiod_y"].includes(id))];
    const categories = ["8", "7", "6", "5", "4", "3", "9", "SSS"];
    const values = { "2023": [1, 2, 3, 4, 5, 35, 50, 100], "2024": [2, 4, 6, 8, 10, 40, 30, 100] };
    return Response.json({ id: ids, size: [8, 2, 1, 1, 1, 1],
      dimension: Object.fromEntries(ids.map((id) => [id, { category: { index: id === category ? categories : id === "timeperiod_y" ? ["2024", "2023"] : query.find((q) => q.code === id).selection.values } }])),
      value: categories.flatMap((_, i) => [values["2024"][i], values["2023"][i]]) });
  });
  assert.deepEqual(await getEducationTrend("KU499", "2025"), [{ year: "2023", value: 10 }, { year: "2024", value: 20 }]);
  assert.equal(posts, 1);
});

test("education shares preserve missing groups and zero denominators", () => {
  assert.equal(higherEducationShare(null), null);
  assert.equal(higherEducationShare({ total: 100, groups: [{ code: "5", count: 5 }] }), null);
  assert.equal(higherEducationShare({ total: 0, groups: [] }), null);
  assert.equal(higherEducationShare({ total: 100, groups: ["5", "6", "7", "8"].map((code) => ({ code, count: 0 })) }), 0);
});

test("trend SVGs use the requested unit and break at missing years", () => {
  const html = renderToString(createElement(TrendSeries, { title: "Energy", unit: "GWh",
    points: [{ year: "2020", value: 10 }, { year: "2022", value: 20 }, { year: "2023", value: null }],
    note: "", source: "Syke", sourceUrl: "https://paastot.hiilineutraalisuomi.fi/", color: "#387c99" }));
  assert.equal((html.match(/<polyline /g) ?? []).length, 2);
  assert.ok(html.includes("<title>2022: 20 GWh</title>"));
  assert.ok(!html.includes("20 %"));
});

const climateHeader = "vuosi;taso_3;taso_4;taso_5;hinku_laskenta;päästökauppa;kt;kt_tuuli;GWh";
const climateCodes = ["Kul", "Säh", "Kau", "Ölj", "Muu", "Teo", "Työ", "Tie", "Rai", "Ves", "Maa", "Jät", "F-k"];
function climateCsv(extra = [], replace = {}) {
  return "\uFEFF" + [climateHeader,
    ...climateCodes.map((sector) => replace[sector] ?? `2024;${sector};a;b;1;0;1,5;0;10`),
    "2024;Tuu;Tuu;Tuu;1;0;0;-50;157,223", ...extra].join("\r\r\n");
}

test("climate history separates annual totals, excludes future and preliminary years", () => {
  const csv = climateCsv([
    ...climateCodes.map((code) => `2022;${code};a;b;1;0;2;999;20`),
    "2022;Tuu;Tuu;Tuu;1;0;0;-10;0", "E2025;Tuu;Tuu;Tuu;1;0;0;-99;999",
  ]);
  const profiles = parseClimateTrend(csv, "2025");
  assert.deepEqual(profiles.map((p) => [p.year, p.energy, p.emissions]), [["2022", 260, 26], ["2024", 130, 19.5]]);
  assert.deepEqual(parseClimateTrend(csv, "2023").map((p) => p.year), ["2022"]);
});

test("climate totals exclude generation and emission credits and respect Hinku scope", () => {
  const profile = parseClimateProfile(climateCsv(["2024;Kul;a;industrial;0;1;900;900;9000"]), "2025");
  assert.equal(profile.year, "2024");
  assert.equal(profile.energy, 130);
  assert.equal(profile.emissions, 19.5);
  assert.equal(profile.windGeneration, 157.223);
  assert.ok(Math.abs(profile.sectors.reduce((sum, s) => sum + s.share, 0) - 100) < 1e-8);
  assert.equal(parseClimateProfile(climateCsv(["E2025;Tuu;Tuu;Tuu;1;0;0;-99;999"]), "2025").year, "2024");
  assert.equal(parseClimateProfile(climateCsv(), "2023"), null);
});

test("climate parsing preserves missing values and signed source corrections without inventing zeroes", () => {
  const missing = parseClimateProfile(climateCsv([], { Kul: "2024;Kul;a;b;1;0;;0;" }), "2024");
  assert.equal(missing.emissions, null);
  assert.equal(missing.energy, null);
  assert.equal(missing.sectors.find((s) => s.code === "Kul").energy, null);
  const zero = parseClimateProfile(climateCsv([], { Kul: "2024;Kul;a;b;1;0;0;0;0" }), "2024");
  assert.equal(zero.sectors.find((s) => s.code === "Kul").energy, 0);
  const correction = parseClimateProfile(climateCsv([], { Kau: "2024;Kau;a;b;1;0;-0.001;-0.001;-0.014" }), "2024");
  assert.equal(correction.sectors.find((s) => s.code === "Kau").energy, -0.014);
  assert.ok(correction.sectors.every((s) => s.share === null));
  const absent = parseClimateProfile([climateHeader, "2024;Tuu;Tuu;Tuu;1;0;0;0;0"].join("\n"), "2024");
  assert.equal(absent.windGeneration, 0);
  assert.equal(absent.energy, null);
});

test("climate rejects malformed columns, duplicate observations and invalid values", () => {
  assert.throws(() => parseClimateProfile(climateCsv(["2024;Kul;a;b;1;0;1,5;0;10"]), "2024"), /Duplicate/);
  assert.throws(() => parseClimateProfile(climateCsv().replace("kt_tuuli", "kt"), "2024"), /columns/);
  assert.throws(() => parseClimateProfile(climateCsv([], { Kul: "2024;Kul;a;b;1;0;Infinity;0;10" }), "2024"), /observation/);
  assert.throws(() => parseClimateProfile(climateCsv(["2024;unknown;a;b;1;0;0;0;0"]), "2024"), /category/);
  assert.throws(() => parseClimateProfile(climateCsv(), "2024C12"), /year/);
});

test("climate fetch uses exact municipality codes and reports source failures", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return String(url).endsWith("kunta_235.csv") ? new Response(climateCsv()) : new Response("", { status: 404 });
  });
  assert.equal((await getClimateProfile("KU235", "2025")).year, "2024");
  assert.equal(await getClimateProfile("KU005", "2025"), null);
  assert.ok(calls[1].endsWith("/kunta_5.csv"));
  await assert.rejects(getClimateProfile("KU../", "2025"), /Invalid/);
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  await assert.rejects(getClimateProfile("KU235", "2025"), /503/);
});

function heatingFixture() {
  const selections = { alue_23_20260101: ["KU499"], timeperiod_y: ["2025"], rakennus_6_20180101: ["SSS"],
    rak_valm_v_10_20210101: ["SSS"], polttoaineet_12_20260101: ["SSS", "01", "02_03_05", "04", "06", "07_08", "09", "99"],
    contentscode: ["rakennus_lkm"] };
  const counts = { SSS: 12278, "01": 164, "02_03_05": 2172, "04": 3395, "06": 30, "07_08": 3664, "09": 996, "99": 1857 };
  const id = Object.keys(selections).reverse();
  const categories = [...selections.polttoaineet_12_20260101].reverse();
  const dimension = Object.fromEntries(id.map((key) => [key, { category: { index: key.startsWith("polttoaineet") ? categories : selections[key] } }]));
  return { selections, data: { id, size: id.map((key) => selections[key].length), dimension, value: categories.map((key) => counts[key]) } };
}

test("heating counts follow returned indexes and preserve unknown and missing values", () => {
  const { selections, data } = heatingFixture();
  const counts = parseHeatingCounts(data, selections);
  assert.equal(counts.SSS, 12278);
  assert.equal(counts["99"], 1857);
  assert.equal(counts["04"], 3395);
  assert.equal(parseHeatingCounts({ ...data, value: [null, ...data.value.slice(1)] }, selections)["99"], null);
  assert.throws(() => parseHeatingCounts({ ...data, value: [1858, ...data.value.slice(1)] }, selections), /reconcile/);
  assert.throws(() => parseHeatingCounts({ ...data, value: [-1, ...data.value.slice(1)] }, selections), /Invalid building/);
  assert.throws(() => parseHeatingCounts({ ...data, dimension: { ...data.dimension, alue_23_20260101: { category: { index: ["KU091"] } } } }, selections), /index/);
});

test("heating requests building counts for the selected municipality and never a future year", async (t) => {
  const { selections, data } = heatingFixture();
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (!options.body) return Response.json({ variables: Object.entries(selections).map(([code, values]) => ({ code, values })) });
    posts++;
    const query = JSON.parse(options.body).query;
    assert.deepEqual(Object.fromEntries(query.map((v) => [v.code, v.selection.values])), selections);
    return Response.json(data);
  });
  assert.equal(await getHeatingProfile("KU499", "2024"), null);
  assert.equal(posts, 0);
  const profile = await getHeatingProfile("KU499", "2025");
  assert.equal(profile.year, "2025");
  assert.equal(profile.total, 12278);
  assert.equal(profile.groups.find((g) => g.code === "09").share, 996 / 12278 * 100);
  await assert.rejects(getHeatingProfile("KU../", "2025"), /Invalid/);
});

test("income statement totals reconcile Mustasaari actuals without counting investment or own work as income", () => {
  const values = { ...parseAccountsFacts(accountsFacts(), "0203026-2", "2025"),
    operatingRevenue: 19810812.35, taxRevenue: 51218513.53, stateTransfers: 21854570,
    interestIncome: 164422.42, otherFinancialIncome: 65581.91, extraordinaryIncome: 0,
    operatingExpenses: 82131787.52, interestExpenses: 2686543.82, otherFinancialExpenses: 6.5,
    depreciation: 10264133.15, extraordinaryExpenses: 0, ownWorkCapitalized: 537786.06,
    annualResult: -1430784.72 };
  const totals = incomeStatementTotals(values);
  assert.equal(totals.reconciled, true);
  assert.ok(Math.abs(totals.income - 93113900.21) < 0.01);
  assert.ok(Math.abs(totals.expenses - 95082470.99) < 0.01);
  assert.deepEqual(incomeStatementTotals({ ...values, investments: 1e9, surplus: 0 }), totals);
  for (const change of [{ extraordinaryIncome: null }, { interestExpenses: Infinity }, { annualResult: -1 }, { ownWorkCapitalized: null }]) {
    assert.deepEqual(incomeStatementTotals({ ...values, ...change }), { income: null, expenses: null, reconciled: false });
  }
  const zero = Object.fromEntries(Object.keys(accountsFields).map((key) => [key, 0]));
  assert.deepEqual(incomeStatementTotals(zero), { income: 0, expenses: 0, reconciled: true });
  assert.deepEqual(incomeStatementTotals({ ...zero, stateTransfers: -100, annualResult: -100 }), { income: -100, expenses: 0, reconciled: true });
});

test("resident counts use returned indexes, reconcile totals and preserve missing data", () => {
  const selections = { area: ["KU499"], year: ["2025"], age: ["018", "019"], status: ["SSS", "1", "2"] };
  const data = { id: ["status", "year", "area", "age"], size: [3, 1, 1, 2],
    dimension: { status: { category: { index: ["2", "SSS", "1"] } }, year: { category: { index: { "2025": 0 } } },
      area: { category: { index: ["KU499"] } }, age: { category: { index: ["019", "018"] } } },
    value: [30, 40, 40, 60, 10, 20] };
  assert.deepEqual(parsePeopleCounts(data, selections, "status"), { SSS: 100, "1": 30, "2": 70 });
  assert.equal(parsePeopleCounts({ ...data, value: [30, 40, 40, 60, null, 20] }, selections, "status")["1"], null);
  assert.throws(() => parsePeopleCounts({ ...data, value: [30, 40, 40, 60, 10, 21] }, selections, "status"), /reconcile/);
  assert.throws(() => parsePeopleCounts({ ...data, value: [30, 40, 40, 60, -1, 20] }, selections, "status"), /Invalid resident count/);
  assert.throws(() => parsePeopleCounts({ ...data, dimension: { ...data.dimension, area: { category: { index: ["KU091"] } } } }, selections, "status"), /index/);
});

test("marital profile includes adults only and selects a published year no later than selection", async (t) => {
  const variables = [
    { code: "alue_23_20260101", values: ["KU499"] }, { code: "timeperiod_y", values: ["2023", "2024", "2026"] },
    { code: "sukupuoli_9_20180101", values: ["SSS"] },
    { code: "ikaryhma_10_20180101", values: [...Array.from({length:100}, (_,i) => String(i).padStart(3,"0")), "100-", "SSS"] },
    { code: "siviilisaaty_16_20190101", values: ["SSS", "1", "2", "4", "5"] },
    { code: "contentscode", values: ["vaerak-vaesto"] }, { code: "kieli_15_20180102", values: ["SSS"] },
  ];
  let query;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (!options?.body) return Response.json({variables});
    query = JSON.parse(options.body).query;
    const ids = query.map((item) => item.code);
    const size = query.map((item) => item.selection.values.length);
    const value = [];
    for (let age = 0; age < 83; age++) value.push(10, 2, 6, 1, 1);
    return Response.json({id:ids, size, dimension:Object.fromEntries(query.map((item) => [item.code, {category:{index:item.selection.values}}])), value});
  });
  const result = await getPeopleProfile("marital", "KU499", "2025");
  assert.equal(result.year, "2024");
  assert.equal(result.total, 830);
  assert.equal(result.groups.find((group) => group.code === "2").share, 60);
  const ages = query.find((item) => item.code.startsWith("ikaryhma")).selection.values;
  assert.equal(ages.length, 83);
  assert.ok(ages.includes("018") && ages.includes("100-") && !ages.includes("017") && !ages.includes("SSS"));
});

test("trend chart server rendering preserves SVG tooltip text without React errors", (context) => {
  const errors = [];
  context.mock.method(console, "error", (...args) => errors.push(args));
  const html = renderToString(createElement(TrendSeries, {
    title: "Trend", points: [{ year: "2024", value: 7.6 }, { year: "2025", value: null }],
    note: "Source note", source: "Source", sourceUrl: "https://example.com", color: "#387c99",
  }));
  assert.deepEqual(errors, [], "SVG title rendering must not produce React errors");
  assert.ok(html.includes("<title>2024: 7,6 %</title>"), "The server must render the complete tooltip");
});


test("municipality search ranks spelling mistakes and partial names", () => {
  const items = [{ code: "KU235", name: "Kauniainen" }, { code: "KU091", name: "Helsinki" },
    { code: "KU049", name: "Espoo" }, { code: "KU905", name: "Vaasa" }];
  for (const query of ["kauniaien", "kauninen", "kauni", " KAUNIAINEN "]) {
    assert.equal(searchMunicipalities(items, query)[0]?.code, "KU235", query);
  }
  assert.equal(searchMunicipalities(items, "helsnki")[0]?.code, "KU091");
  assert.deepEqual(searchMunicipalities(items, "xyzxyz"), []);
  assert.equal(searchMunicipalities(items, "ka").length, 1);
});

const areaCode = "alue_23_20260101";
const yearCode = "timeperiod_y";

function dataset(overrides = {}) {
  return {
    id: [areaCode, "contentscode", yearCode],
    size: [1, 1, 2],
    source: "Tilastokeskus",
    updated: "2026-05-29T05:00:00Z",
    dimension: {
      contentscode: { category: { index: { "vaerak-vaesto": 0 }, label: { "vaerak-vaesto": "Väestö 31.12." } } },
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
    interestIncome: "973", otherFinancialIncome: "925", interestExpenses: "556",
    otherFinancialExpenses: "574", extraordinaryIncome: "1117", extraordinaryExpenses: "1101",
    ownWorkCapitalized: "1599",
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

test("official Swedish aliases are joined by code, not metadata order, and tolerate translation outages", async (t) => {
  let offline = false;
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (url) => {
    const swedish = url.includes("/sv/");
    if (swedish && offline) throw new Error("offline");
    return Response.json({ variables: [
      { code: areaCode, values: swedish ? ["KU235", "KU499"] : ["KU499", "KU235"],
        valueTexts: swedish ? ["Grankulla", "Korsholm"] : ["Mustasaari", "Kauniainen"] },
      { code: yearCode, values: ["2025"], valueTexts: ["2025"] },
    ] });
  });
  const { municipalities } = await getMunicipalityCatalog();
  for (const [query, code] of [["korsholm", "KU499"], ["korshom", "KU499"], ["grankulla", "KU235"], ["kauniaien", "KU235"]]) {
    assert.equal(searchMunicipalities(municipalities, query)[0].code, code);
  }
  assert.equal(matchesMunicipalityName(municipalities.find((m) => m.code === "KU499"), " KORSHOLM "), true);
  assert.equal(matchesMunicipalityName(municipalities[0], ""), false);
  offline = true;
  assert.equal((await getMunicipalityCatalog()).municipalities.length, 2);
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
    value: [3000, 1000, 200, 10, 50, 740, 40, 20, 65, null],
  });
  data.dimension.contentscode = { category: { index: codes, label: Object.fromEntries(codes.map((code) => [code, code])) } };
  data.dimension[yearCode].category = { index: ["2025"], label: { "2025": "2025" } };
  mockResponse(t, data);
  const result = await getDemographicProfile("KU091", "2025");
  assert.deepEqual(result.values, { children: null, workingAge: 65, seniors: 20, averageAge: 40,
    finnish: 74, swedish: 5, sami: 1, otherLanguages: 20, density: 3000 });
  assert.equal(result.year, "2025");
});

test("Utsjoki language counts include Sami, reconcile, and preserve absent or zero values", async (t) => {
  const raw = { children: 10, workingAge: 60, seniors: 30, averageAge: 45, density: 0.5,
    population: 1112, finnish: 597, swedish: 7, sami: 458, otherLanguages: 50 };
  const codes = Object.values(demographicIndicators);
  const data = dataset({ size: [1, codes.length, 1], value: Object.keys(demographicIndicators).map((key) => raw[key]) });
  data.dimension.contentscode = { category: { index: codes, label: {} } };
  data.dimension[areaCode].category = { index: ["KU890"], label: { KU890: "Utsjoki" } };
  data.dimension[yearCode].category = { index: ["2025"], label: { "2025": "2025" } };
  mockResponse(t, data);
  const profile = await getDemographicProfile("KU890", "2025");
  assert.equal(profile.values.sami, 458 / 1112 * 100);
  assert.ok(Math.abs(["finnish", "swedish", "sami", "otherLanguages"].reduce((sum, key) => sum + profile.values[key], 0) - 100) < 1e-8);
  const samiIndex = codes.indexOf(demographicIndicators.sami);
  data.value[samiIndex] = null;
  assert.equal((await getDemographicProfile("KU890", "2025")).values.sami, null);
  data.value[samiIndex] = 0;
  await assert.rejects(getDemographicProfile("KU890", "2025"), /reconcile/);
  data.value[codes.indexOf(demographicIndicators.population)] = 654;
  assert.equal((await getDemographicProfile("KU890", "2025")).values.sami, 0);
  data.value = codes.map(() => 0);
  assert.equal((await getDemographicProfile("KU890", "2025")).values.sami, null);
  data.value[samiIndex] = 1.5;
  await assert.rejects(getDemographicProfile("KU890", "2025"), /Invalid demographic/);
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

test("population rejects wrong metric, duplicate indexes, fractional people and malformed dimensions", async (t) => {
  let current = dataset();
  t.mock.method(globalThis, "fetch", async () => Response.json(current));
  const invalid = [
    (d) => { d.dimension.contentscode.category.index = { "vaerak-kokmuutos": 0 }; },
    (d) => { d.dimension[yearCode].category.index = { "2024": 0, "2025": 0 }; },
    (d) => { d.dimension[areaCode].category.index = { KU049: 0 }; },
    (d) => { d.id = [areaCode, yearCode, yearCode]; },
    (d) => { d.value = [100]; },
    (d) => { d.value[0] = 100.5; },
  ];
  for (const mutate of invalid) {
    current = dataset(); mutate(current);
    await assert.rejects(getPopulationSeries("KU091", ["2024", "2025"]));
  }
});

test("map uses verified code and year and rejects wrong or ambiguous geography", async (t) => {
  const { GET } = loadTs("src/app/api/municipality-map/route.ts");
  const feature = { type: "Feature", properties: { kunta: "235", nimi: "Kauniainen", vuosi: 2026 },
    geometry: { type: "Polygon", coordinates: [[[24, 60], [25, 60], [25, 61], [24, 61], [24, 60]]] } };
  let payload = { features: [feature] };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => { calls.push(String(url)); return Response.json(payload); });
  const request = { nextUrl: new URL("http://localhost/api/municipality-map?code=KU235&name=Helsinki&details=0") };
  const valid = await GET(request);
  const result = await valid.json();
  assert.equal(result.name, "Kauniainen", "Untrusted name cannot override the verified municipality");
  assert.deepEqual(result.bbox, [24, 60, 25, 61]);
  assert.equal(calls.length, 1, "Only the boundary source is requested");
  assert.equal(result.places, undefined);
  assert.equal(result.settlements, undefined);
  assert.equal(result.detailsStatus, undefined);
  assert.match(valid.headers.get("Cache-Control"), /public/);
  assert.equal(new URL(calls[0]).searchParams.get("CQL_FILTER"), "kunta='235'");
  for (const features of [[], [feature, feature], [{ ...feature, properties: { ...feature.properties, kunta: "091" } }],
    [{ ...feature, properties: { ...feature.properties, vuosi: 2025 } }]]) {
    payload = { features };
    const response = await GET(request);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.ok(calls.every((url) => url.includes("tilastointialueet")));
});


test("grid selection never borrows a future observation", () => {
  const { gridYearFor } = loadTs("src/lib/map-data.ts");
  assert.equal(gridYearFor("1990"), null);
  assert.equal(gridYearFor("2004"), null);
  assert.equal(gridYearFor("2005"), 2005);
  assert.equal(gridYearFor("2009"), 2005);
  assert.equal(gridYearFor("2010"), 2010);
  assert.equal(gridYearFor("2025"), 2025);
  assert.equal(gridYearFor("invalid"), null);
});


test("population SVGs preserve gaps and render complete tooltip strings", () => {
  const { default: PopulationChart } = loadTs("src/app/population-chart.tsx");
  const html = renderToString(createElement(PopulationChart, { series: {
    municipalityName: "Test", municipalityCode: "KU235", source: "Test", updatedAt: "", regionalNote: "",
    points: [{ year: "2020", population: 100 }, { year: "2022", population: 120 }],
  } }));
  assert.equal((html.match(/<polyline /g) ?? []).length, 2);
  assert.ok(html.includes("<title>Test, 2022: 120</title>"));
});




test("education streams while civil status is pending and failure stays local", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { default: People } = loadTs("src/app/municipality-people.tsx", {
    "@/lib/people": { getPeopleProfile: async kind => {
      if (kind === "marital") { await gate; throw new Error("Source unavailable"); }
      return { year: "2024", total: 10, groups: [] };
    } },
  });
  const tree = People({ code: "KU092", year: "2025" });
  const boundaries = tree.props.children[2].props.children;
  assert.ok(boundaries.every(child => child.type === Suspense));
  const [education, marital] = boundaries.map(child => child.props.children);
  let maritalReady = false;
  const pending = marital.type(marital.props).then(value => { maritalReady = true; return value; });
  try {
    const ready = await education.type(education.props);
    const html = renderToString(createElement(ready.type, ready.props));
    assert.match(html, /Havaintovuosi 2024/);
    assert.equal(maritalReady, false);
  } finally { release(); }
  const failed = await pending;
  assert.match(renderToString(createElement(failed.type, failed.props)), /Tietoja ei juuri nyt saada lähteestä/);
});




test("boundary map rejects invalid codes, handles outages, and cancels upstream on departure", async (t) => {
  const { GET } = loadTs("src/app/api/municipality-map/route.ts");
  const viewer = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    if (calls === 1) return new Response("Unavailable", { status: 503 });
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      viewer.abort();
    });
  });
  const request = code => ({ nextUrl: new URL("http://localhost/api/municipality-map?code=" + code) });
  const invalid = await GET(request("bad"));
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
  const unavailable = await GET(request("KU235"));
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
  const cancelled = await GET({ ...request("KU235"), signal: viewer.signal });
  assert.equal(cancelled.status, 499);
  assert.equal(calls, 2);
});
