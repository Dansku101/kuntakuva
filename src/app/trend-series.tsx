"use client";

import { LineChart, Table2 } from "lucide-react";
import { useId, useState } from "react";

type Point = { year: string; value: number | null };
const format = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });

export default function TrendSeries({ title, points, note, source, sourceUrl, color, reference }: {
  title: string; points: Point[]; note: string; source: string; sourceUrl: string;
  color: string; reference?: number;
}) {
  const id = useId();
  const [view, setView] = useState<"chart" | "table">("chart");
  const values = points.flatMap((point) => point.value === null ? [] : [point.value]);
  const latest = [...points].reverse().find((point) => point.value !== null);
  const minYear = Number(points[0]?.year ?? 0);
  const maxYear = Number(points.at(-1)?.year ?? minYear);
  const domain = reference === undefined ? values : [...values, reference];
  const min = domain.length ? Math.min(...domain) : 0;
  const max = domain.length ? Math.max(...domain) : 1;
  const padding = Math.max((max - min) * 0.2, 1);
  const bottom = min - padding;
  const top = max + padding;
  const x = (year: string) => maxYear === minYear ? 260 : 64 + (Number(year) - minYear) / (maxYear - minYear) * 420;
  const y = (value: number) => 178 - (value - bottom) / (top - bottom) * 148;
  const segments: string[][] = [];
  let segment: string[] = [];
  // Missing observations break the line instead of implying continuous data.
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (point.value === null || (i > 0 && Number(point.year) - Number(points[i - 1].year) !== 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point.value !== null) segment.push(`${x(point.year)},${y(point.value)}`);
  }
  if (segment.length) segments.push(segment);

  return <section className="history-series" aria-labelledby={id}>
    <div className="section-heading">
      <h2 id={id}>{title}</h2>
      <div className="segmented" role="group" aria-label={`${title}: esitystapa`}>
        <button type="button" title="Kaavio" aria-label="Kaavio" aria-pressed={view === "chart"} onClick={() => setView("chart")}><LineChart size={17} /></button>
        <button type="button" title="Taulukko" aria-label="Taulukko" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={17} /></button>
      </div>
    </div>
    <div className="history-readout"><strong>{latest?.value != null ? `${format.format(latest.value)} %` : "Ei tietoa"}</strong><span>{latest?.year ?? "Ei saatavilla olevia vuosia"}</span></div>
    {!values.length ? <p className="empty-chart">Valitulle ajanjaksolle ei ole saatavilla varmennettuja tietoja.</p>
      : view === "table" ? <div className="table-wrap"><table>
        <caption className="sr-only">{title}, vuosittaiset arvot</caption>
        <thead><tr><th scope="col">Vuosi</th><th scope="col">%</th></tr></thead>
        <tbody>{[...points].reverse().map((point) => <tr key={point.year}><th scope="row">{point.year}</th><td>{point.value === null ? "Ei tietoa" : format.format(point.value)}</td></tr>)}</tbody>
      </table></div> : <svg className="history-chart" viewBox="0 0 520 218" role="img" aria-label={`${title}, ${minYear}–${maxYear}. ${points.map((point) => `${point.year}: ${point.value === null ? "ei tietoa" : `${format.format(point.value)} %`}`).join("; ")}`}>
        {[0, 1, 2, 3].map((tick) => {
          const value = bottom + (top - bottom) * tick / 3;
          return <g key={tick}><line x1="64" x2="484" y1={y(value)} y2={y(value)} className="chart-grid" /><text x="55" y={y(value) + 4} textAnchor="end" className="axis-label">{format.format(value)}</text></g>;
        })}
        {reference !== undefined && <g><line x1="64" x2="484" y1={y(reference)} y2={y(reference)} stroke="#818b85" strokeDasharray="5 4" /><text x="484" y={y(reference) - 6} textAnchor="end" className="axis-label">{reference} %</text></g>}
        {segments.map((coordinates, index) => <polyline key={index} points={coordinates.join(" ")} fill="none" stroke={color} strokeWidth="2.5" />)}
        {points.map((point) => point.value !== null && <circle key={point.year} cx={x(point.year)} cy={y(point.value)} r="4" fill={color}><title>{`${point.year}: ${format.format(point.value)} %`}</title></circle>)}
        {[...new Set([minYear, maxYear])].map((year) => <text key={year} x={x(String(year))} y="206" textAnchor="middle" className="axis-label">{year}</text>)}
      </svg>}
    <p className="chart-footnote">{note}</p>
    <a className="text-link history-source" href={sourceUrl} target="_blank" rel="noreferrer">{source}</a>
  </section>;
}
