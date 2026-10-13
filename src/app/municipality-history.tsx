import { getEmploymentTrend } from "@/lib/employment";
import { depreciationCoverage, getMunicipalityAccounts } from "@/lib/finance";
import TrendSeries from "./trend-series";
import { sameFinancialArea } from "@/lib/financial-geography";

export default async function MunicipalityHistory({ code, year }: { code: string; year: string }) {
  const financeYears = ["2024", "2025"].filter((item) => Number(item) <= Number(year));
  const [employment, accounts] = await Promise.all([
    getEmploymentTrend(code, year).then((points) => ({ points, failed: false })).catch(() => ({ points: [], failed: true })),
    Promise.allSettled(financeYears.map((item) => getMunicipalityAccounts(code, item))),
  ]);
  const employmentPoints = employment.points.map((point) => ({ year: point.year, value: point.unemploymentRate }));
  const financePoints = accounts.map((result, index) => ({
    year: financeYears[index],
    breakBefore: index > 0 && !sameFinancialArea(code, financeYears[index - 1], financeYears[index]),
    value: result.status === "fulfilled" && result.value ? depreciationCoverage(result.value.values) : null,
  }));
  const latestAccounts = accounts.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []).at(-1);
  return <div className="history-grid">
    <TrendSeries title="Työttömyyden kehitys" points={employmentPoints} color="#387c99"
      note={`${employment.failed ? "Lähde ei juuri nyt vastaa. " : ""}18–64-vuotiaiden työttömät / työvoima vuoden lopussa. Enintään kuusi uusinta julkaistua vuotta valittuun vuoteen asti. Y-akseli rajattu havaintoihin.`}
      source="Tilastokeskus: työssäkäynti, 115b · aluejako 2025"
      sourceUrl="https://pxdata.stat.fi/PxWeb/fi/StatFin/StatFin__tyokay/statfin_tyokay_pxt_115b.px/" />
    <TrendSeries title="Tulorahoituksen kehitys" points={financePoints} color="#a87732" reference={100}
      note={`${accounts.some((result) => result.status === "rejected") ? "Osa lähdetiedoista ei juuri nyt vastaa. " : ""}Vuosikate / poistot ja arvonalentumiset. 100 % = vuosikate kattaa poistot. Varmennetut tilinpäätökset 2024–2025, enintään valittuun vuoteen asti; kunta, ei konserni. Y-akseli rajattu havaintoihin.`}
      breakNote={financePoints.some((point) => point.breakBefore) ? "Kuntaraja muuttunut: eri alueiden havaintoja ei yhdistetä viivalla eikä vuosimuutosta lasketa." : undefined}
      source="Valtiokonttori: toteutuneet tilinpäätökset (KKNR)"
      sourceUrl={latestAccounts?.sourceUrl ?? "https://www.valtiokonttori.fi/palvelu/kuntien-ja-kuntayhtymien-taloustietojen-raportointi/"} />
  </div>;
}
