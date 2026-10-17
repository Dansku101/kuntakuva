import Link from "next/link";
import { ArrowUpRight, GraduationCap, Thermometer, Leaf } from "lucide-react";
import { getPeopleProfile, higherEducationShare } from "@/lib/people";
import { getHeatingProfile } from "@/lib/energy";
import { getClimateProfile } from "@/lib/climate";

const number = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
export default async function MunicipalitySummary({ code, year, baseUrl }: { code: string; year: string; baseUrl: string }) {
  const [education, heating, climate] = await Promise.allSettled([
    getPeopleProfile("education", code, year), getHeatingProfile(code, year), getClimateProfile(code, year),
  ]);
  const e = education.status === "fulfilled" ? education.value : null;
  const h = heating.status === "fulfilled" ? heating.value : null;
  const c = climate.status === "fulfilled" ? climate.value : null;
  const share = higherEducationShare(e);
  const leading = h?.groups.every((g) => g.share !== null) && h.total! > 0 ? [...h.groups].sort((a, b) => b.share! - a.share!)[0] : null;
  const items = [
    { title: "Koulutus", icon: GraduationCap, anchor: "people-heading", year: e?.year,
      value: share === null ? "Ei tietoa" : `${number.format(share)} %`, note: "Korkea-asteen tutkinto · 15 vuotta täyttäneet", failed: education.status === "rejected" },
    { title: "Rakennukset", icon: Thermometer, anchor: "energy-heading", year: h?.year,
      value: leading?.label ?? "Ei tietoa", note: leading ? `${number.format(leading.share!)} % rakennuksista · suurin lämmitysryhmä` : "Lämmitystiedot saatavilla vuodesta 2025", failed: heating.status === "rejected" },
    { title: "Ympäristö", icon: Leaf, anchor: "climate-summary", year: c?.year,
      value: c?.emissions == null ? "Ei tietoa" : `${number.format(c.emissions)} kt CO₂e`, note: "Kasvihuonekaasupäästöt · Hinku, ilman hyvityksiä", failed: climate.status === "rejected" },
  ];
  return <section className="topic-summary" aria-label="Kunnan profiili">{items.map((item) => <div key={item.title}>
    <h2><item.icon size={18} aria-hidden="true" />{item.title}<span>{item.year ? `Havaintovuosi ${item.year}` : "Ei havaintoa"}</span></h2>
    <strong className="topic-value">{item.value}</strong><p>{item.failed ? "Lähde ei juuri nyt vastaa." : item.note}</p>
    <Link prefetch={false} className="text-link" href={`${baseUrl}&nakyma=tilastot#${item.anchor}`}>Tarkemmat tiedot<span className="sr-only">: {item.title}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
  </div>)}</section>;
}
