import { getDemographicProfile, getPopulationSeries } from "./statfin";
import { getPeopleProfile, higherEducationShare } from "./people";
import { getHeatingProfile } from "./energy";
import { getClimateProfile } from "./climate";
import { getMunicipalityAccounts, incomeStatementTotals, perResidentAmount } from "./finance";

export type ComparisonRow = { label: string; unit: string; year: string | null; values: [number | null, number | null] };
export type ComparisonGroup = { title: string; note: string; source: string; href: string; rows: ComparisonRow[]; failed: boolean };

// A provider returns its latest observation at or before the cutoff. Walk backwards
// until both observations share a year; never silently compare different years.
export async function commonProfiles<T extends { year: string }>(
  fetcher: (code: string, year: string) => Promise<T | null>, codes: [string, string], selectedYear: string,
): Promise<[T, T] | null> {
  let cutoff = selectedYear;
  for (let attempt = 0; attempt < 100; attempt++) {
    const pair = await Promise.all(codes.map((code) => fetcher(code, cutoff)));
    if (!pair[0] || !pair[1]) return null;
    if (pair.some((p) => !/^\d{4}$/.test(p!.year) || Number(p!.year) > Number(cutoff))) throw new Error("Invalid comparison year");
    if (pair[0].year === pair[1].year) return [pair[0], pair[1]];
    cutoff = String(Math.min(Number(pair[0].year), Number(pair[1].year)));
  }
  throw new Error("No common comparison year found");
}

export async function getComparison(codes: [string, string], year: string): Promise<ComparisonGroup[]> {
  const row = <T extends { year: string }>(pair: [T, T] | null, label: string, unit: string, value: (profile: T) => number | null): ComparisonRow =>
    ({ label, unit, year: pair?.[0].year ?? null, values: pair ? [value(pair[0]), value(pair[1])] : [null, null] });
  const sections = [
    {
      title: "Väestö", note: "Vuoden lopun väestö, aluejako 2026. Ikäryhmien osuudet koko väestöstä.",
      source: "Tilastokeskus · 11ra", href: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vaerak/11ra.px/",
      load: async () => {
        const pair = await commonProfiles(async (code, y) => {
          const [population, demographic] = await Promise.all([getPopulationSeries(code, [y]), getDemographicProfile(code, y)]);
          return { year: y, population: population.points.find((p) => p.year === y)?.population ?? null, ...demographic.values };
        }, codes, year);
        return [row(pair, "Asukkaita", "asukasta", (p) => p.population), row(pair, "Alle 15-vuotiaat", "%", (p) => p.children),
          row(pair, "65 vuotta täyttäneet", "%", (p) => p.seniors), row(pair, "Keski-ikä", "vuotta", (p) => p.averageAge),
          row(pair, "Ruotsinkieliset", "%", (p) => p.swedish)];
      },
    },
    {
      title: "Koulutus", note: "Korkea-aste sisältää tutkintotasot 5–8. Osuudet 15 vuotta täyttäneistä, aluejako 2026.",
      source: "Tilastokeskus · 12bq", href: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vkour/12bq.px/",
      load: async () => {
        const pair = await commonProfiles((code, y) => getPeopleProfile("education", code, y), codes, year);
        return [row(pair, "Korkea-asteen tutkinto", "%", higherEducationShare),
          row(pair, "Ei perusasteen jälkeistä tutkintoa", "%", (p) => p.groups.find((g) => g.code === "9")?.share ?? null)];
      },
    },
    {
      title: "Talous", note: "Kunnan tilinpäätös, ei konserni. Tulot ja kulut sisältävät tuloslaskelman erät, eivät lainoja tai investointeja. Asukaskohtaiset luvut: saman vuoden lopun väestö (aluejako 2026); kuntaliitokset voivat rajoittaa vertailua. Varmennettu kattavuus 2024–2025.",
      source: "Valtiokonttori · KKNR", href: "https://www.valtiokonttori.fi/palvelu/kuntien-ja-kuntayhtymien-taloustietojen-raportointi/",
      load: async () => {
        const pair = await commonProfiles(async (code, y) => {
          const accounts = await getMunicipalityAccounts(code, y);
          if (!accounts) return null;
          const population = (await getPopulationSeries(code, [accounts.year])).points.find((p) => p.year === accounts.year)?.population ?? null;
          return { ...accounts, population, totals: incomeStatementTotals(accounts.values) };
        }, codes, year);
        return [row(pair, "Tulot yhteensä", "€/asukas", (p) => perResidentAmount(p.totals.income, p.population)),
          row(pair, "Kulut yhteensä", "€/asukas", (p) => perResidentAmount(p.totals.expenses, p.population)),
          row(pair, "Tilikauden tulos", "€/asukas", (p) => perResidentAmount(p.values.annualResult, p.population))];
      },
    },
    {
      title: "Rakennusten lämmitys", note: "Osuudet rakennusten lukumäärästä, eivät energiankulutuksesta. Rekisteritieto, aluejako 2026. Nykyinen kattavuus 2025.",
      source: "Tilastokeskus · 15er", href: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/raku/15er.px/",
      load: async () => {
        const pair = await commonProfiles(getHeatingProfile, codes, year);
        return [row(pair, "Kaukolämpö", "%", (p) => p.groups.find((g) => g.code === "01")?.share ?? null),
          row(pair, "Sähkö", "%", (p) => p.groups.find((g) => g.code === "04")?.share ?? null),
          row(pair, "Maalämpö", "%", (p) => p.groups.find((g) => g.code === "09")?.share ?? null)];
      },
    },
    {
      title: "Energia ja päästöt", note: "Kuntien kokonaismäärät, eivät asukaskohtaisia. Hinku-laskenta, ilman päästöhyvityksiä tai maankäyttöä; ei koko hiilijalanjälki. Tuulivoima on tuotantoa, ei kulutusta.",
      source: "Syke · Hinku", href: "https://paastot.hiilineutraalisuomi.fi/",
      load: async () => {
        const pair = await commonProfiles(getClimateProfile, codes, year);
        return [row(pair, "Energiankulutus", "GWh", (p) => p.energy), row(pair, "Kasvihuonekaasupäästöt", "kt CO₂e", (p) => p.emissions),
          row(pair, "Tuulivoiman tuotanto", "GWh", (p) => p.windGeneration)];
      },
    },
  ];
  return Promise.all(sections.map(async ({ load, ...section }) => {
    try { return { ...section, rows: await load(), failed: false }; }
    catch (error) { console.warn(`Comparison unavailable: ${section.title}`, error); return { ...section, rows: [], failed: true }; }
  }));
}
