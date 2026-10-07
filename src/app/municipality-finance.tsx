import { ExternalLink } from "lucide-react";
import { expenseShares, getMunicipalityAccounts, perResidentAmount } from "@/lib/finance";

const euros = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
const money = (value: number | null) => value === null ? "Ei tietoa" : euros.format(value);
const compact = (value: number | null) => value === null ? "Ei tietoa" : `${millions.format(value / 1_000_000)} milj. €`;

export default async function MunicipalityFinance({ code, name, year, population }: { code: string; name: string; year: string; population: number | null }) {
  let accounts;
  let failed = false;
  try { accounts = await getMunicipalityAccounts(code, year); }
  catch (error) { failed = true; console.warn("Municipality accounts unavailable:", error); }
  if (!accounts) return <section className="overview-section" aria-labelledby="finance-heading">
    <p className="eyebrow">{name.toLocaleUpperCase("fi-FI")} · {year}</p>
    <h2 id="finance-heading">Toteutunut talous</h2>
    <p className="overview-note">{failed ? "Tilinpäätöstietoja ei juuri nyt saada lähteestä." : `Vuoden ${year} varmennettuja tilinpäätöstietoja ei ole saatavilla tässä näkymässä. Varmennettu kattavuus: 2024–2025.`} Talousarvioita tai ennusteita ei esitetä toteumina.</p>
  </section>;
  const v = accounts.values;
  const shares = expenseShares(v);
  const expenses = [
    { label: "Henkilöstökulut", value: v.personnel },
    { label: "Palvelujen ostot", value: v.services },
    { label: "Aineet, tarvikkeet ja tavarat", value: v.materials },
    { label: "Avustukset", value: v.grants },
    { label: "Muut toimintakulut", value: v.otherExpenses },
  ];
  const income: { label: string; value: number | null }[] = [
    { label: "Toimintatuotot", value: v.operatingRevenue },
    { label: "Verotulot", value: v.taxRevenue },
    { label: "Valtionosuudet", value: v.stateTransfers },
    { label: "Vuosikate", value: v.annualMargin },
    { label: "Poistot ja arvonalentumiset", value: v.depreciation },
    { label: "Tilikauden tulos ennen siirtoja", value: v.annualResult },
  ];
  return <section className="overview-section finance-section" aria-labelledby="finance-heading">
    <div className="section-heading">
      <div><p className="eyebrow">TILINPÄÄTÖS {year} · KUNTA, EI KONSERNI</p><h2 id="finance-heading">Toteutunut talous</h2></div>
      <a className="text-link" href={accounts.sourceUrl} target="_blank" rel="noreferrer">Valtiokonttori<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (avautuu uuteen välilehteen)</span></a>
    </div>
    <dl className="finance-totals">
      <div><dt>Toimintakulut</dt><dd title={money(v.operatingExpenses)}>{compact(v.operatingExpenses)}</dd><dd className="finance-detail">{money(perResidentAmount(v.operatingExpenses, population))} / asukas · ei investointeja tai poistoja</dd></div>
      <div><dt>Investoinnit</dt><dd title={money(v.investments)}>{compact(v.investments)}</dd><dd className="finance-detail">Toteutuneet bruttoinvestoinnit</dd></div>
      <div><dt>{v.surplus === null ? "Tilikauden ylijäämä / alijäämä" : v.surplus < 0 ? "Tilikauden alijäämä" : "Tilikauden ylijäämä"}</dt><dd className={v.surplus === null ? "" : v.surplus < 0 ? "negative" : "positive"} title={money(v.surplus)}>{compact(v.surplus)}</dd><dd className="finance-detail">Tilinpäätössiirtojen jälkeen · ei budjetin ylitys</dd></div>
    </dl>
    <details className="data-disclosure">
      <summary>Menot ja tulot tarkemmin</summary>
      <div className="overview-layout">
        <div><h3>Menolajit</h3><dl className="finance-breakdown">{expenses.map((item, i) => <div key={item.label}>
          <dt>{item.label}</dt><dd>{money(item.value)}{shares && <small>{percent.format(shares[i])} % toimintakuluista</small>}</dd>
          {shares && <div className="finance-track" aria-hidden="true"><span style={{ width: `${shares[i]}%` }} /></div>}
        </div>)}</dl>
          <p className="overview-note finance-note">Menolajit eivät ole palvelukohtainen jakauma.{!shares && " Prosenttiosuuksia ei esitetä: menolajit eivät ole täydelliset tai täsmää yhteissummaan."}</p>
        </div>
        <div><h3>Tulot ja tuloksen muodostuminen</h3><dl className="finance-secondary">
          {income.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
        </dl></div>
      </div>
      <p className="overview-note finance-note">Kunta liikelaitoksineen, sisäiset erät poistettu. Asukaskohtainen luku käyttää Tilastokeskuksen vuoden {year} lopun väkilukua. Alijäämä on tilikauden saldo, ei talousarvion ylitys; ylitystä ei lasketa ilman vertailukelpoista budjettia.</p>
      <p className="finance-source">KKNR · {accounts.corrected ? "Jälkikorjattu" : "Lopullinen"} raportti · Hyväksytty {accounts.publishedAt} · Y-tunnus {accounts.businessId}</p>
    </details>
  </section>;
}
