import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { getMunicipalityCatalog, getPopulationSeries } from "@/lib/statfin";
import MunicipalityPicker from "./municipality-picker";
import PopulationChart from "./population-chart";
import MunicipalityOverview from "./municipality-overview";
import MunicipalityFinance from "./municipality-finance";
import MunicipalityMap from "./municipality-map";
import MunicipalityTrends from "./municipality-trends";
import MunicipalityHistory from "./municipality-history";
import { Suspense } from "react";

const views = [
  { id: "yleiskuva", label: "Yleiskuva", description: "Miltä kunnan tilanne näyttää?" },
  { id: "trendit", label: "Trendit", description: "Miten kunta on muuttunut?" },
  { id: "kartta", label: "Kartta", description: "Missä väestö ja paikat sijaitsevat?" },
  { id: "tilastot", label: "Tilastot", description: "Mistä kunnan väestö ja talous koostuvat?" },
] as const;

export default async function Home({ searchParams }: {
  searchParams: Promise<{ kunta?: string | string[]; vuosi?: string | string[]; nakyma?: string | string[] }>;
}) {
  const [{ municipalities, years }, params] = await Promise.all([getMunicipalityCatalog(), searchParams]);
  const selectedCode = typeof params.kunta === "string" && municipalities.some((item) => item.code === params.kunta)
    ? params.kunta : municipalities.find((item) => item.code === "KU091")?.code ?? municipalities[0].code;
  const selectedYear = typeof params.vuosi === "string" && years.includes(params.vuosi)
    ? params.vuosi : years[years.length - 1];
  const view = views.find((item) => item.id === params.nakyma) ?? views[0];
  const name = municipalities.find((item) => item.code === selectedCode)!.name;
  const baseUrl = `/?${new URLSearchParams({ kunta: selectedCode, vuosi: selectedYear })}`;
  // The map needs the catalog, but should not depend on population observations.
  // One extra year supports the first visible table row's annual change.
  const count = view.id === "trendit" ? 21 : view.id === "yleiskuva" ? 6 : 1;
  const requestedYears = years.filter((year) => Number(year) <= Number(selectedYear)).slice(-count);
  const series = view.id === "kartta" ? null : await getPopulationSeries(selectedCode, requestedYears);
  const updated = series?.updatedAt ? new Date(series.updatedAt) : null;
  const updatedLabel = updated && !Number.isNaN(updated.getTime())
    ? new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki" }).format(updated) : "Ei ilmoitettu";

  return <main id="main-content">
    <section className="control-band" aria-label="Kunnan ja vuoden valinta"><div className="shell">
      <MunicipalityPicker key={`${selectedCode}-${selectedYear}-${view.id}`} municipalities={municipalities}
        years={years} selectedCode={selectedCode} selectedYear={selectedYear} view={view.id} />
    </div></section>
    <div className="shell dashboard">
      <div className="page-heading"><div>
        <p className="breadcrumb"><MapPin size={14} aria-hidden="true" />Suomi<span>/</span>Kuntakoodi {selectedCode.slice(2)}</p>
        <h1>{name}</h1><p className="page-subtitle">{view.description}</p>
      </div><span className="year-badge"><CalendarDays size={16} aria-hidden="true" />Valittu vuosi {selectedYear}</span></div>
      <nav className="view-tabs" aria-label="Kuntakuvan osiot">{views.map((item) =>
        <Link key={item.id} prefetch={false} href={`${baseUrl}&nakyma=${item.id}`}
          aria-current={item.id === view.id ? "page" : undefined}>{item.label}</Link>
      )}</nav>
      <div className="view-content" key={`${selectedCode}-${selectedYear}-${view.id}`}>
        {view.id === "yleiskuva" && series && <>
          <p className="view-intro">Kolme näkökulmaa kuntaan. Havaintovuosi näkyy jokaisen luvun yhteydessä; työllisyystieto julkaistaan viiveellä.</p>
          <Suspense fallback={<p className="history-loading" role="status">Haetaan kunnan avainlukuja…</p>}>
            <MunicipalityTrends series={series} year={selectedYear} />
          </Suspense>
          <nav className="explore-links" aria-label="Tutustu kuntaan tarkemmin">
            {views.slice(1).map((item) => <Link key={item.id} prefetch={false} href={`${baseUrl}&nakyma=${item.id}`}>
              <strong>{item.label}<ArrowUpRight size={17} aria-hidden="true" /></strong><span>{item.description}</span>
            </Link>)}
          </nav>
        </>}
        {view.id === "trendit" && series && <>
          <p className="view-intro">Väestö, työttömyys ja tulorahoitus omilla julkaistuilla ajanjaksoillaan. Kaavioiden rinnalla ovat tarkat taulukot.</p>
          <PopulationChart series={series} />
          <Suspense fallback={<p className="history-loading" role="status">Haetaan työllisyyden ja talouden aikasarjoja…</p>}>
            <MunicipalityHistory code={selectedCode} year={selectedYear} />
          </Suspense>
        </>}
        {view.id === "kartta" && <MunicipalityMap key={`${selectedCode}-${selectedYear}`} code={selectedCode} name={name} year={selectedYear} />}
        {view.id === "tilastot" && series && <>
          <p className="view-intro">Väestörakenne vuoden lopussa ja saman vuoden toteutunut kuntatalous. Talouden varmennettu kattavuus on 2024–2025.</p>
          <Suspense fallback={<p className="history-loading" role="status">Haetaan väestörakennetta…</p>}>
            <MunicipalityOverview code={selectedCode} name={name} year={selectedYear} />
          </Suspense>
          <Suspense fallback={<p className="history-loading" role="status">Haetaan tilinpäätöstä…</p>}>
            <MunicipalityFinance code={selectedCode} name={name} year={selectedYear} population={series.points.at(-1)?.population ?? null} />
          </Suspense>
        </>}
        {series && <details className="data-disclosure source-disclosure"><summary>Väestöaineisto ja aluejako</summary>
          <p>Tilastokeskus, taulukko 11ra · päivitetty {updatedLabel} · saatavilla {years[0]}–{years.at(-1)}.</p>
          <p>{series.regionalNote || "Väestön aikasarja noudattaa vuoden 2026 aluejakoa, ei historiallisia kuntarajoja."}</p>
          <p>Työssäkäyntitilaston aluejako on 2025. Eri aluejakojen lukuja ei yhdistetä yhdeksi tunnusluvuksi.</p>
          <a className="text-link" href="https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vaerak/11ra.px/" target="_blank" rel="noreferrer">Avaa väestön lähdetaulukko (uusi välilehti)</a>
        </details>}
      </div>
    </div>
    <footer className="app-footer"><div className="shell"><span>Kuntakuva · Suomen kunnat lukuina</span><span>Avoin tieto · Tilastokeskus ja Valtiokonttori</span></div></footer>
  </main>;
}
