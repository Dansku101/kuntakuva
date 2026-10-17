import { ExternalLink, Thermometer } from "lucide-react";
import { getHeatingProfile, heatingSource } from "@/lib/energy";

const integer = new Intl.NumberFormat("fi-FI");
const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });

export default async function MunicipalityEnergy({ code, year, compact = false }: { code: string; year: string; compact?: boolean }) {
  let profile;
  let failed = false;
  try { profile = await getHeatingProfile(code, year); }
  catch (error) { failed = true; console.warn("Municipality heating unavailable:", error); }
  const leading = profile?.groups.filter((g) => g.count !== null).sort((a, b) => b.count! - a.count!)[0];
  const complete = profile?.groups.every((g) => g.share !== null);
  const table = profile && <table className="people-table heating-table">
    <caption className="sr-only">Rakennusten pääasiallinen lämmitysaine {profile.year}</caption>
    <thead><tr><th scope="col">Lämmitysaine</th><th scope="col">Rakennuksia</th><th scope="col">Osuus</th></tr></thead>
    <tbody>{profile.groups.map((g) => <tr key={g.code}>
      <th scope="row"><span className="heating-label"><i style={{ background: g.color }} aria-hidden="true" />{g.label}</span></th>
      <td>{g.count === null ? "Ei tietoa" : integer.format(g.count)}</td><td>{g.share === null ? "Ei tietoa" : `${decimal.format(g.share)} %`}</td>
    </tr>)}</tbody>
  </table>;
  return <section className="overview-section energy-section" aria-labelledby="energy-heading">
    <div className="section-heading">
      <div><p className="eyebrow">ENERGIA · {profile ? `Havaintovuosi ${profile.year}` : `Valittu vuosi ${year}`}</p><h2 id="energy-heading"><Thermometer size={20} aria-hidden="true" />Rakennusten lämmitys</h2></div>
      <a className="text-link" href={heatingSource} target="_blank" rel="noreferrer">Tilastokeskus<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (uusi välilehti)</span></a>
    </div>
    {profile ? <>
      <div className="energy-summary">
        <p><strong>{profile.total === null ? "Ei tietoa" : integer.format(profile.total)}</strong><span>rakennusta tilastossa</span></p>
        {complete && leading && leading.count! > 0 && <p><strong>{leading.label}</strong><span>suurin ryhmä · {decimal.format(leading.share!)} % rakennuksista</span></p>}
      </div>
      {!compact && complete && profile.total! > 0 && <div className="energy-mix" aria-hidden="true">{profile.groups.map((g) =>
        <span key={g.code} style={{ width: `${g.share}%`, background: g.color }} />)}</div>}
      {compact ? <details className="data-disclosure"><summary>Lämmitysaineet ja osuudet</summary>{table}</details> : table}
      {profile.year !== year && <p className="people-note">Uusin julkaistu havainto valittuun vuoteen mennessä: {profile.year}.</p>}
    </> : <p className="overview-note">{failed ? "Lämmitystietoja ei juuri nyt saada lähteestä." : "Valitulle vuodelle ei ole tietoja tässä aineistossa. Kattavuus alkaa vuodesta 2025."}</p>}
    <p className="people-note">Rekisteriin merkitty pääasiallinen lämmitysaine, osuus rakennusten lukumäärästä. Ei energiankulutuksen tai asuntojen jakauma. Lämmitystavan muutokset eivät aina päivity rekisteriin. Aluejako 2026.</p>
    {!compact && <p className="people-note">Mukana tilaston rakennuskanta, myös vapaa-ajan asuinrakennukset. Muun muassa maatalous-, sauna- ja talousrakennuksia on rajattu pois. Öljyä ja kaasua sekä puuta ja turvetta ei erotella lähdetaulukossa.</p>}
  </section>;
}
