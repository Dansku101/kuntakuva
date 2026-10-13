import { ExternalLink, Wind, Leaf } from "lucide-react";
import { climateMethod, climateSource, getClimateProfile } from "@/lib/climate";

const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const amount = (value: number | null, unit: string) => value === null ? "Ei tietoa" : `${decimal.format(value)} ${unit}`;

export default async function MunicipalityClimate({ code, year, compact = false }: { code: string; year: string; compact?: boolean }) {
  let profile;
  let failed = false;
  try { profile = await getClimateProfile(code, year); }
  catch (error) { failed = true; console.warn("Municipality climate unavailable:", error); }
  const missing = failed ? "Tietoja ei juuri nyt saada lähteestä." : "Valittuun vuoteen mennessä ei ole saatavilla varmennettuja tietoja.";
  const period = profile ? `${profile.year}${profile.year !== year ? " · uusin lopullinen havainto valittuun vuoteen mennessä" : ""}` : year;
  const source = <a className="text-link" href={climateSource} target="_blank" rel="noreferrer">Syke<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (uusi välilehti)</span></a>;
  const table = profile && <table className="people-table climate-table">
    <caption className="sr-only">Energiankulutus ja päästöt sektoreittain {profile.year}, Hinku-laskenta ilman päästöhyvityksiä</caption>
    <thead><tr><th scope="col">Sektori</th><th scope="col">Energia, GWh</th><th scope="col">Päästöt, kt CO₂e</th></tr></thead>
    <tbody>{profile.sectors.map((sector) => <tr key={sector.code}>
      <th scope="row">{sector.label}{sector.share !== null && <span className="people-track" aria-hidden="true"><span style={{ width: `${sector.share}%` }} /></span>}</th>
      <td>{amount(sector.energy, "")}</td><td>{amount(sector.emissions, "")}</td>
    </tr>)}</tbody>
    <tfoot><tr><th scope="row">Yhteensä</th><td>{amount(profile.energy, "")}</td><td>{amount(profile.emissions, "")}</td></tr></tfoot>
  </table>;
  return <>
    <section className="overview-section energy-section" aria-labelledby="generation-heading">
      <div className="section-heading"><div><p className="eyebrow">SÄHKÖNTUOTANTO · {period}</p><h2 id="generation-heading"><Wind size={20} aria-hidden="true" />Paikallinen tuulivoima</h2></div>{source}</div>
      {profile ? <div className="energy-summary"><p><strong>{amount(profile.windGeneration, "GWh")}</strong><span>kunnan alueella tuotettua tuulisähköä vuodessa</span></p></div>
        : <p className="overview-note">{missing}</p>}
      <p className="people-note">Tuotantotietojen kattavuus: tuulivoima. Aurinko-, vesi-, ydin- ja muun sähköntuotannon kuntakohtaisia lukuja ei ole vielä tässä näkymässä. Tuulivoiman nollatulos ei tarkoita, ettei kunnassa olisi muuta sähköntuotantoa.</p>
    </section>
    <section className="overview-section energy-section" aria-labelledby="climate-heading">
      <div className="section-heading"><div><p className="eyebrow">ENERGIA JA ILMASTO · {period}</p><h2 id="climate-heading"><Leaf size={20} aria-hidden="true" />Energiankulutus ja päästöt</h2></div>{source}</div>
      <p className="people-base">Hinku-laskenta ilman päästöhyvityksiä</p>
      {profile ? <>
        <div className="energy-summary">
          <p><strong>{amount(profile.energy, "GWh")}</strong><span>energiankulutus Hinku-rajauksella</span></p>
          <p><strong>{amount(profile.emissions, "kt CO₂e")}</strong><span>käyttöperäiset kasvihuonekaasupäästöt</span></p>
        </div>
        {compact ? <details className="data-disclosure"><summary>Energia ja päästöt sektoreittain</summary>{table}</details> : table}
      </> : <p className="overview-note">{missing}</p>}
      <p className="people-note">Rajaus ei sisällä teollisuuden sähkönkulutusta, päästökauppateollisuuden polttoaineita, teollisuuden jätteiden käsittelyä eikä kuorma-, paketti- ja linja-autojen läpiajoliikennettä. Tuulivoimatuotantoa ei lasketa kulutukseksi eikä sen päästöhyvityksiä vähennetä päästöistä.</p>
      {!compact && <p className="people-note">Ei koko kunnan hiilijalanjälki: muun muassa maankäytön päästöt ja hiilinielut ovat laskennan ulkopuolella. kt CO₂e tarkoittaa tuhatta tonnia hiilidioksidiekvivalenttia. Viivat kuvaavat sektorien osuuksia päästöistä. Lähde huomioi kuntaliitokset takautuvasti.</p>}
      <a className="text-link" href={climateMethod} target="_blank" rel="noreferrer">Laskentamenetelmä ja rajaukset<span className="sr-only"> (uusi välilehti)</span></a>
    </section>
  </>;
}
