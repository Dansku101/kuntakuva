"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import type { ComparisonGroup, ComparisonSectionId } from "@/lib/comparison";
import type { Municipality } from "@/lib/statfin";
import { comparisonDifference } from "@/lib/comparison-difference";

const decimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const signedDecimal = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const signedInteger = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

export default function ComparisonSection({ id, initialGroup, primary, peer, year }: {
  id: ComparisonSectionId; initialGroup: ComparisonGroup; primary: Municipality; peer: Municipality; year: string;
}) {
  const [group, setGroup] = useState(initialGroup);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function retry() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      const query = new URLSearchParams({ section: id, kunta: primary.code, vertaa: peer.code, vuosi: year });
      const response = await fetch(`/api/comparison?${query}`, {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      });
      if (!response.ok) throw new Error("Comparison retry failed");
      setGroup(await response.json() as ComparisonGroup);
    } catch {
      // Keep this section's retry available; sibling sections retain their data.
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <section className="comparison-section" aria-labelledby={`comparison-${id}`}>
    <div className="section-heading"><h2 id={`comparison-${id}`}>{group.title}</h2><a className="text-link" href={group.href} target="_blank" rel="noreferrer">{group.source}<span className="sr-only"> (uusi välilehti)</span></a></div>
    {group.failed ? <div className="comparison-failure" aria-busy={pending}>
      <p className="overview-note" role="status">{pending ? "Haetaan osion tietoja uudelleen…" : "Tämän osion lähdetietoja ei juuri nyt saada. Muut vertailut ovat käytettävissä."}</p>
      <button type="button" className="button" onClick={retry} disabled={pending}>
        {pending ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <RotateCw size={16} aria-hidden="true" />}Yritä uudelleen<span className="sr-only">: {group.title}</span>
      </button>
    </div> : <table className="comparison-table">
      <caption>{group.title}: {primary.name} ja {peer.name}. Ero = {peer.name} − {primary.name}.</caption>
      <thead><tr><th scope="col">Tunnusluku</th><th scope="col">{primary.name}</th><th scope="col">{peer.name}</th><th scope="col" className="difference-column">Ero</th></tr></thead>
      <tbody>{group.rows.map((row) => {
        const whole = row.unit === "asukasta" || row.unit === "€/asukas";
        const difference = comparisonDifference(row);
        const differenceText = difference.value === null ? "Ei vertailukelpoista tietoa" : `${(whole ? signedInteger : signedDecimal).format(difference.value)} ${difference.unit}`;
        return <tr key={row.label}>
          <th scope="row">{row.label}<small>{row.unit} · {row.year ?? "Ei yhteistä havaintovuotta"}</small><small className="mobile-difference">Ero: {differenceText}</small></th>
          {row.values.map((value, index) => <td key={index}>{value === null ? "Ei tietoa" : (whole ? integer : decimal).format(value)}</td>)}
          <td className="difference-column">{difference.value === null ? "Ei vertailua" : (whole ? signedInteger : signedDecimal).format(difference.value)}<small>{difference.unit}</small></td>
        </tr>;
      })}</tbody>
    </table>}
    <p className="people-note">{group.note}</p>
  </section>;
}
