import { getComparison } from "@/lib/comparison";
import type { Municipality } from "@/lib/statfin";

const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });

export default async function MunicipalityComparison({ primary, peer, year }: { primary: Municipality; peer: Municipality; year: string }) {
  const groups = await getComparison([primary.code, peer.code], year);
  return <div className="comparison-results">{groups.map((group) => <section className="comparison-section" key={group.title}>
    <div className="section-heading"><h2>{group.title}</h2><a className="text-link" href={group.href} target="_blank" rel="noreferrer">{group.source}<span className="sr-only"> (uusi välilehti)</span></a></div>
    {group.failed ? <p className="overview-note" role="status">Tämän osion lähdetietoja ei juuri nyt saada. Muut vertailut ovat käytettävissä.</p> : <table className="comparison-table">
      <caption className="sr-only">{group.title}: {primary.name} ja {peer.name}</caption>
      <thead><tr><th scope="col">Tunnusluku</th><th scope="col">{primary.name}</th><th scope="col">{peer.name}</th></tr></thead>
      <tbody>{group.rows.map((row) => <tr key={row.label}>
        <th scope="row">{row.label}<small>{row.unit} · {row.year ?? "Ei yhteistä havaintovuotta"}</small></th>
        {row.values.map((value, index) => <td key={index}>{value === null ? "Ei tietoa" : (row.unit === "asukasta" || row.unit === "€/asukas" ? integer : decimal).format(value)}</td>)}
      </tr>)}</tbody>
    </table>}
    <p className="people-note">{group.note}</p>
  </section>)}</div>;
}
