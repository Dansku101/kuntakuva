import { GraduationCap, Heart } from "lucide-react";
import { getPeopleProfile, type PeopleProfile } from "@/lib/people";

import { Suspense } from "react";

const integer = new Intl.NumberFormat("fi-FI");
const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });

function Distribution({ title, profile, year, note, href, icon, failed }: {
  title: string; profile: PeopleProfile | null; year: string; note: string; href: string; icon: React.ReactNode; failed: boolean;
}) {
  return <section className="people-distribution" aria-label={title}>
    <div className="section-heading"><h3>{icon}{title}</h3><span className="profile-caption">{profile ? `Havaintovuosi ${profile.year}${profile.year !== year ? " · uusin saatavilla" : ""}` : `Valittu vuosi ${year}`}</span></div>
    {profile ? <>
      <p className="people-base">{profile.total === null ? "Kokonaismäärä puuttuu" : `${integer.format(profile.total)} asukasta`} · {title === "Koulutus" ? "15 vuotta täyttäneet" : "18 vuotta täyttäneet"}</p>
      <table className="people-table"><caption className="sr-only">{title}, henkilömäärät ja osuudet</caption>
        <thead><tr><th scope="col">{title === "Koulutus" ? "Korkein tutkinto" : "Siviilisääty"}</th><th scope="col">Asukasta</th><th scope="col">Osuus</th></tr></thead>
        <tbody>{profile.groups.map((group) => <tr key={group.code}>
          <th scope="row"><span>{group.label}</span>{group.share !== null && <span className="people-track" aria-hidden="true"><span style={{ width: `${group.share}%` }} /></span>}</th>
          <td>{group.count === null ? "Ei tietoa" : integer.format(group.count)}</td><td>{group.share === null ? "Ei tietoa" : `${decimal.format(group.share)} %`}</td>
        </tr>)}</tbody>
      </table>
    </> : <p className="overview-note">{failed ? "Tietoja ei juuri nyt saada lähteestä." : "Valitulle vuodelle ei ole saatavilla tietoja."}</p>}
    <p className="people-note">{note}</p>
    <a className="text-link" href={href} target="_blank" rel="noreferrer">Tilastokeskus · {title === "Koulutus" ? "12bq" : "11rz"}<span className="sr-only"> (uusi välilehti)</span></a>
  </section>;
}

function compactEducation(profile: PeopleProfile | null): PeopleProfile | null {
  if (!profile) return null;
  const definitions = [
    { code: "9", label: "Ei perusasteen jälkeistä tutkintoa", codes: ["9"] },
    { code: "3-4", label: "Toinen aste tai erikoisammattikoulutusaste", codes: ["3", "4"] },
    { code: "5-8", label: "Korkea-aste", codes: ["5", "6", "7", "8"] },
  ];
  return { ...profile, groups: definitions.map((item) => {
    const values = item.codes.map((code) => profile.groups.find((group) => group.code === code)?.count);
    const count = values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
    return { code: item.code, label: item.label, count, share: count === null || profile.total === null || profile.total === 0 ? null : count / profile.total * 100 };
  }) };
}

export async function ResidentDistribution({ kind, code, year, compact = false }: {
  kind: "education" | "marital"; code: string; year: string; compact?: boolean;
}) {
  let profile: PeopleProfile | null = null;
  let failed = false;
  try { profile = await getPeopleProfile(kind, code, year); }
  catch { failed = true; }
  return kind === "education" ? <Distribution title="Koulutus" year={year}
    icon={<GraduationCap size={18} aria-hidden="true" />} failed={failed}
    profile={compact ? compactEducation(profile) : profile}
    note="Korkein suoritettu tutkinto, osuus 15 vuotta täyttäneistä. Ei perusasteen jälkeistä tutkintoa ei tarkoita, ettei henkilö olisi käynyt koulua. Aluejako 2026."
    href="https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vkour/12bq.px/" />
    : <Distribution title="Siviilisääty" year={year} icon={<Heart size={18} aria-hidden="true" />}
      failed={failed} profile={profile}
      note="Osuus 18 vuotta täyttäneistä. Naimaton ei tarkoita samaa kuin sinkku: avoliitto ei näy siviilisäädyssä. Rekisteröidyt parisuhteet sisältyvät vastaaviin luokkiin. Aluejako 2026."
      href="https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/vaerak/11rz.px/" />;
}

export default function MunicipalityPeople({ code, year, compact = false }: { code: string; year: string; compact?: boolean }) {
  return <section className="people-section" aria-labelledby="people-heading">
    <p className="eyebrow">ASUKKAAT</p><h2 id="people-heading">Koulutus ja siviilisääty</h2>
    <div className="people-grid">
      <Suspense fallback={<p className="history-loading" role="status">Haetaan koulutustietoja…</p>}>
        <ResidentDistribution kind="education" code={code} year={year} compact={compact} />
      </Suspense>
      <Suspense fallback={<p className="history-loading" role="status">Haetaan siviilisäätyä…</p>}>
        <ResidentDistribution kind="marital" code={code} year={year} />
      </Suspense>
    </div>
  </section>;
}
