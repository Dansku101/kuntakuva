import { ArrowDownRight, ArrowUpRight, CalendarDays, ExternalLink, MapPin, Minus, Users } from "lucide-react";
import Link from "next/link";
import { getMunicipalityCatalog, getPopulationSeries } from "@/lib/statfin";
import { percentFormat, populationChange, populationFormat, signedPopulationFormat } from "@/lib/population";
import MunicipalityPicker from "./municipality-picker";
import PopulationChart from "./population-chart";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ kunta?: string | string[]; vuosi?: string | string[] }>;
}) {
  const [{ municipalities, years }, params] = await Promise.all([getMunicipalityCatalog(), searchParams]);
  const selectedCode = typeof params.kunta === "string" && municipalities.some((item) => item.code === params.kunta)
    ? params.kunta : municipalities.find((item) => item.code === "KU091")?.code ?? municipalities[0].code;
  const selectedYear = typeof params.vuosi === "string" && years.includes(params.vuosi)
    ? params.vuosi : years[years.length - 1];
  // One extra year supports the first visible row's annual-change calculation.
  const requestedYears = years.filter((year) => Number(year) <= Number(selectedYear)).slice(-21);
  const series = await getPopulationSeries(selectedCode, requestedYears);
  const current = series.points[series.points.length - 1];
  const previous = series.points.find((point) => Number(point.year) === Number(selectedYear) - 1);
  const annualChange = populationChange(current, previous);
  const first = series.points.slice(-10)[0];
  const periodChange = first.year === current.year ? null : populationChange(current, first);
  const AnnualIcon = !annualChange || annualChange.absolute === 0 ? Minus : annualChange.absolute > 0 ? ArrowUpRight : ArrowDownRight;
  const PeriodIcon = !periodChange || periodChange.absolute === 0 ? Minus : periodChange.absolute > 0 ? ArrowUpRight : ArrowDownRight;
  const updated = series.updatedAt ? new Date(series.updatedAt) : null;
  const updatedLabel = updated && !Number.isNaN(updated.getTime())
    ? new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki" }).format(updated) : "Ei ilmoitettu";
  const popularCodes = ["KU091", "KU049", "KU837", "KU092", "KU853", "KU564"];
  const popular = popularCodes.flatMap((code) => {
    const municipality = municipalities.find((item) => item.code === code);
    return municipality ? [municipality] : [];
  });

  return (
    <main id="main-content">
      <section className="control-band" aria-label="Kunnan ja vuoden valinta">
        <div className="shell">
          <MunicipalityPicker key={`${selectedCode}-${selectedYear}`} municipalities={municipalities}
            years={years} selectedCode={selectedCode} selectedYear={selectedYear} />
        </div>
      </section>
      <div className="shell dashboard">
        <div className="page-heading">
          <div>
            <p className="breadcrumb"><MapPin size={14} aria-hidden="true" />Suomi<span>/</span>Kuntatilastot</p>
            <h1>{series.municipalityName}</h1>
            <p className="page-subtitle">Väestö ja kehitys</p>
          </div>
          <span className="year-badge"><CalendarDays size={16} aria-hidden="true" />31.12.{selectedYear}</span>
        </div>

        <section className="metrics" aria-label="Väestön tunnusluvut">
          <div className="metric">
            <div className="metric-label"><Users size={17} aria-hidden="true" /><h2>Väkiluku</h2></div>
            <p className="metric-value">{current.population === null ? "Ei tietoa" : populationFormat.format(current.population)}</p>
            <p className="metric-detail">Asukasta vuoden {selectedYear} lopussa</p>
          </div>
          <div className="metric">
            <div className="metric-label"><AnnualIcon size={18} aria-hidden="true" /><h2>Vuosimuutos</h2></div>
            <p className={`metric-value ${!annualChange || annualChange.absolute === 0 ? "" : annualChange.absolute < 0 ? "negative" : "positive"}`}>
              {annualChange ? signedPopulationFormat.format(annualChange.absolute) : "Ei tietoa"}
            </p>
            <p className="metric-detail">{annualChange?.percent !== null && annualChange?.percent !== undefined
              ? `${percentFormat.format(annualChange.percent)} % edellisestä vuodesta` : "Vertailutietoa ei saatavilla"}</p>
          </div>
          <div className="metric">
            <div className="metric-label"><PeriodIcon size={18} aria-hidden="true" /><h2>{first.year === selectedYear ? "Ajanjakson muutos" : `Muutos ${first.year}–${selectedYear}`}</h2></div>
            <p className={`metric-value ${!periodChange || periodChange.absolute === 0 ? "" : periodChange.absolute < 0 ? "negative" : "positive"}`}>
              {periodChange?.percent !== null && periodChange?.percent !== undefined ? `${percentFormat.format(periodChange.percent)} %` : "Ei tietoa"}
            </p>
            <p className="metric-detail">{periodChange ? `${signedPopulationFormat.format(periodChange.absolute)} asukasta ajanjaksolla` : "Vertailutietoa ei saatavilla"}</p>
          </div>
        </section>

        <div className="dashboard-grid">
          <PopulationChart key={`${selectedCode}-${selectedYear}`} series={series} />
          <aside className="data-aside" aria-label="Aineiston tiedot">
            <section>
              <p className="eyebrow">AINEISTO</p><h2>Lukujen taustalla</h2>
              <dl className="source-details">
                <div><dt>Lähde</dt><dd>{series.source}</dd></div>
                <div><dt>Päivitetty</dt><dd>{updatedLabel}</dd></div>
                <div><dt>Kuntakoodi</dt><dd>{selectedCode.slice(2)}</dd></div>
                <div><dt>Saatavilla olevat vuodet</dt><dd>{years[0]}–{years[years.length - 1]}</dd></div>
              </dl>
              <a className="text-link" href="https://stat.fi/tilasto/vaerak" target="_blank" rel="noreferrer">
                Väestörakenne-tilasto<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (avautuu uuteen välilehteen)</span>
              </a>
            </section>
            <section className="regional-note"><h3>Aluejako</h3><p>{series.regionalNote || "Aikasarja noudattaa lähdetaulukon aluejakoa."}</p></section>
          </aside>
        </div>

        <nav className="municipality-links" aria-label="Siirry kuntaan">
          <h2>Muita kuntia</h2>
          <div>{popular.map((item) => <Link key={item.code} prefetch={false}
            href={`/?${new URLSearchParams({ kunta: item.code, vuosi: selectedYear })}`}
            aria-current={item.code === selectedCode ? "page" : undefined}>
            {item.name}<ArrowUpRight size={15} aria-hidden="true" />
          </Link>)}</div>
        </nav>
      </div>
      <footer className="app-footer"><div className="shell"><span>Kuntakuva</span><span>Avoin tilastotieto · Tilastokeskus</span></div></footer>
    </main>
  );
}
