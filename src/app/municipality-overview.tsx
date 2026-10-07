import { ExternalLink } from "lucide-react";
import { getDemographicProfile } from "@/lib/statfin";

const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });

export default async function MunicipalityOverview({ code, name, year }: { code: string; name: string; year: string }) {
  let profile;
  try {
    profile = await getDemographicProfile(code, year);
  } catch (error) {
    console.error("Municipality demographics unavailable:", error);
    return <section className="overview-section" aria-labelledby="demographics-heading">
      <p className="eyebrow">{name.toLocaleUpperCase("fi-FI")} · {year}</p>
      <h2 id="demographics-heading">Väestörakenne</h2>
      <p className="overview-note">Väestörakenteen tietoja ei juuri nyt saada lähteestä.</p>
    </section>;
  }
  const values = profile.values;
  const ages = [
    { label: "Alle 15-vuotiaat", value: values.children, className: "children" },
    { label: "15–64-vuotiaat", value: values.workingAge, className: "working-age" },
    { label: "65 vuotta täyttäneet", value: values.seniors, className: "seniors" },
  ];
  const languages = [
    { label: "Suomenkieliset", value: values.finnish },
    { label: "Ruotsinkieliset", value: values.swedish },
    { label: "Muut kielet kuin suomi, ruotsi ja saame", value: values.otherLanguages },
  ];
  const format = (value: number | null, unit: string) => value === null ? "Ei tietoa" : `${decimal.format(value)} ${unit}`;
  return <section className="overview-section" aria-labelledby="demographics-heading">
    <div className="section-heading">
      <div><p className="eyebrow">{name.toLocaleUpperCase("fi-FI")} · {year}</p><h2 id="demographics-heading">Väestörakenne</h2></div>
      <a className="text-link" href="https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vaerak/11ra.px/" target="_blank" rel="noreferrer">Tilastokeskus<ExternalLink size={14} /><span className="sr-only"> (avautuu uuteen välilehteen)</span></a>
    </div>
    <div className="overview-layout">
      <div>
        <h3>Ikäjakauma</h3>
        <div className="age-distribution" aria-hidden="true">
          {ages.map((age) => <span key={age.className} className={age.className} style={{ width: `${age.value ?? 0}%` }} />)}
        </div>
        <dl className="age-facts">{ages.map((age) => <div key={age.className}>
          <dt><span className={`age-swatch ${age.className}`} />{age.label}</dt><dd>{format(age.value, "%")}</dd>
        </div>)}</dl>
        <dl className="profile-facts">
          <div><dt>Keski-ikä</dt><dd>{format(values.averageAge, "vuotta")}</dd></div>
          <div><dt>Väestöntiheys</dt><dd>{format(values.density, "asukasta / km²")}</dd></div>
        </dl>
      </div>
      <div>
        <h3>Kielijakauma</h3>
        <dl className="language-facts">{languages.map((language) => <div key={language.label}>
          <dt>{language.label}</dt><dd>{format(language.value, "%")}</dd>
          <div className="language-track" aria-hidden="true"><span style={{ width: `${language.value ?? 0}%` }} /></div>
        </div>)}</dl>
      </div>
    </div>
  </section>;
}
