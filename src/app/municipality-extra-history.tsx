import { getEducationTrend } from "@/lib/people";
import { climateMethod, getClimateTrend } from "@/lib/climate";
import TrendSeries from "./trend-series";
import Link from "next/link";

export default async function MunicipalityExtraHistory({ code, year, baseUrl }: { code: string; year: string; baseUrl: string }) {
  const [education, climate] = await Promise.allSettled([getEducationTrend(code, year), getClimateTrend(code, year)]);
  const profiles = climate.status === "fulfilled" ? climate.value.slice(-20) : [];
  const climateNote = `${climate.status === "rejected" ? "Lähde ei juuri nyt vastaa. " : ""}Hinku-laskenta, lopulliset havainnot. Ei tuulivoiman päästöhyvityksiä eikä maankäyttöä. Ei kunnan koko hiilijalanjälki. Y-akseli rajattu havaintoihin.`;
  return <>
    <div className="history-grid">
      <TrendSeries title="Korkea-asteen koulutus" points={education.status === "fulfilled" ? education.value : []}
        color="#387c99" note={`${education.status === "rejected" ? "Lähde ei juuri nyt vastaa. " : ""}Korkea-asteen tutkinnon suorittaneet (tasot 5–8), osuus 15 vuotta täyttäneistä. Kymmenen uusinta julkaistua vuotta, aluejako 2026. Y-akseli rajattu havaintoihin.`}
        source="Tilastokeskus: väestön koulutusrakenne, 12bq" sourceUrl="https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vkour/12bq.px/" />
      <TrendSeries title="Kasvihuonekaasupäästöt" points={profiles.map((p) => ({ year: p.year, value: p.emissions }))}
        color="#9b686c" unit="kt CO₂e" note={climateNote} source="Syke: Hinku-laskenta ja rajaukset" sourceUrl={climateMethod} />
      <TrendSeries title="Energiankulutus" points={profiles.map((p) => ({ year: p.year, value: p.energy }))}
        color="#357a61" unit="GWh" note={`${climateNote} Tuotanto ei sisälly kulutukseen.`} source="Syke: Hinku-laskenta ja rajaukset" sourceUrl={climateMethod} />
      <section className="history-series"><h2>Rakennusten lämmitys</h2>
        <p className="people-note">Nykyinen lähdetaulukko kattaa vuoden 2025. Vertailukelpoista aikasarjaa ei vielä ole; aiempien taulukoiden rajaukset poikkeavat nykyisestä.</p>
        <Link prefetch={false} className="text-link" href={`${baseUrl}&nakyma=tilastot#energy-heading`}>Lämmitysaineiden jakauma</Link>
      </section>
    </div>
  </>;
}
