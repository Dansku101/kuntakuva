import { Activity, BriefcaseBusiness, Users } from "lucide-react";
import { getEmploymentTrend } from "@/lib/employment";
import { depreciationCoverage, getMunicipalityAccounts } from "@/lib/finance";
import { fiveYearPopulationChange, percentagePointChange } from "@/lib/trends";
import { populationFormat } from "@/lib/population";
import type { PopulationSeries } from "@/lib/statfin";

const percent = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export default async function MunicipalityTrends({ series, year }: { series: PopulationSeries; year: string }) {
  const code = series.municipalityCode;
  const [employment, currentAccounts, previousAccounts] = await Promise.allSettled([
    getEmploymentTrend(code, year), getMunicipalityAccounts(code, year),
    getMunicipalityAccounts(code, String(Number(year) - 1)),
  ]);
  for (const result of [employment, currentAccounts, previousAccounts]) {
    if (result.status === "rejected") console.warn("Municipality trend unavailable:", result.reason);
  }
  const points = employment.status === "fulfilled" ? employment.value : [];
  const currentEmployment = points.at(-1);
  const previousEmployment = points.find((p) => Number(p.year) === Number(currentEmployment?.year) - 1);
  const unemployment = currentEmployment?.unemploymentRate ?? null;
  const employmentChange = currentEmployment ? percentagePointChange(
    { year: currentEmployment.year, value: unemployment },
    previousEmployment && { year: previousEmployment.year, value: previousEmployment.unemploymentRate },
  ) : null;
  const current = currentAccounts.status === "fulfilled" ? currentAccounts.value : null;
  const previous = previousAccounts.status === "fulfilled" ? previousAccounts.value : null;
  const coverage = current ? depreciationCoverage(current.values) : null;
  const previousCoverage = previous ? depreciationCoverage(previous.values) : null;
  const financeChange = percentagePointChange({ year, value: coverage },
    previous ? { year: previous.year, value: previousCoverage } : undefined);
  const growth = fiveYearPopulationChange(series.points, year);
  const population = series.points.find((p) => p.year === year)?.population ?? null;
  return <section className="trend-profile" aria-labelledby="profile-heading">
    <div className="section-heading"><h2 id="profile-heading">Kunnan suunta</h2><span className="profile-caption">Väestö · työ · talous</span></div>
    <div className="metrics">
      <div className="metric">
        <div className="metric-label"><Users size={17} aria-hidden="true" /><h3>Väestö · {year}</h3></div>
        <p className="metric-value">{population === null ? "Ei tietoa" : populationFormat.format(population)}</p>
        <p className="profile-status">{growth === null ? "Viiden vuoden vertailu puuttuu" : growth > 0 ? "Väestö kasvaa" : growth < 0 ? "Väestö vähenee" : "Väestö ennallaan"}</p>
        <p className="metric-detail">{growth === null ? "Asukasta vuoden lopussa" : `${signed.format(growth)} % · ${Number(year) - 5}–${year}`}</p>
      </div>
      <div className="metric">
        <div className="metric-label"><BriefcaseBusiness size={17} aria-hidden="true" /><h3>Työttömyys · {currentEmployment?.year ?? "ei tietoa"}</h3></div>
        <p className="metric-value">{unemployment === null ? "Ei tietoa" : `${percent.format(unemployment)} %`}</p>
        <p className={`profile-status ${employmentChange === null || employmentChange === 0 ? "" : employmentChange < 0 ? "positive" : "negative"}`}>
          {employmentChange === null ? employment.status === "rejected" ? "Lähde ei juuri nyt vastaa" : "Vuosivertailu puuttuu" : employmentChange < 0 ? "Työttömyys laskee" : employmentChange > 0 ? "Työttömyys kasvaa" : "Työttömyys ennallaan"}
        </p>
        <p className="metric-detail">{employmentChange === null ? "18–64-vuotiaiden työvoimasta" : `${signed.format(employmentChange)} prosenttiyks. vuodessa`}{currentEmployment && currentEmployment.year !== year && " · uusin saatavilla"}</p>
      </div>
      <div className="metric">
        <div className="metric-label"><Activity size={17} aria-hidden="true" /><h3>Tulorahoitus · {year}</h3></div>
        <p className="metric-value">{coverage === null ? "Ei tietoa" : `${percent.format(coverage)} %`}</p>
        <p className={`profile-status ${coverage === null ? "" : coverage >= 100 ? "positive" : "negative"}`}>{coverage === null ? currentAccounts.status === "rejected" ? "Lähde ei juuri nyt vastaa" : "Varmennettu toteuma puuttuu" : coverage >= 100 ? "Vuosikate kattaa poistot" : "Vuosikate ei kata poistoja"}</p>
        <p className="metric-detail">{financeChange === null ? "Vuosikate / poistot ja arvonalentumiset" : `${signed.format(financeChange)} prosenttiyks. vuodessa`}</p>
      </div>
    </div>
    <details className="data-disclosure profile-method">
      <summary>Tulkinta ja lähteet</summary>
      <p>Väestön suunta on viiden vuoden kokonaismuutos, ei ennuste. Työttömyysaste on vuoden lopun työttömät / työvoima, molemmat 18–64-vuotiaita; vuosimuutos lasketaan vain peräkkäisistä vuosista. Luvut eivät ole kuukausitilaston vuosikeskiarvoja.</p>
      <p>Tulorahoitus on vuosikate / poistot ja arvonalentumiset × 100. Vähintään 100 % tarkoittaa, että vuosikate kattaa tämän kulumisen mittarin; se ei takaa investointien rahoitusta tai velattomuutta. Yksittäinen vuosi voi sisältää kertaluonteisia eriä. Tämä on rajattu tilannekuva, ei virallinen terveysluokitus tai kokonaispistemäärä.</p>
      <p><a className="text-link" href="https://stat.fi/tilasto/vaerak" target="_blank" rel="noreferrer">Tilastokeskus: väestörakenne</a> · <a className="text-link" href="https://pxdata.stat.fi/PxWeb/fi/StatFin/StatFin__tyokay/statfin_tyokay_pxt_115b.px/" target="_blank" rel="noreferrer">Työssäkäynti, 115b (aluejako 2025)</a>{current && <> · <a className="text-link" href={current.sourceUrl} target="_blank" rel="noreferrer">Valtiokonttori: KKNR {year}</a></>}</p>
    </details>
  </section>;
}
