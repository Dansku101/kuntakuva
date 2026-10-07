"use client";

import { Download, LineChart, Table2 } from "lucide-react";
import { useId, useState } from "react";
import type { PopulationSeries } from "@/lib/statfin";
import { percentFormat, populationChange, populationCsv, populationFormat, relativePopulationPoints, signedPopulationFormat } from "@/lib/population";

export default function PopulationChart({ series }: { series: PopulationSeries }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [period, setPeriod] = useState(10);
  const [hoverYear, setHoverYear] = useState<string | null>(null);
  const [scale, setScale] = useState<"population" | "change">("population");
  const titleId = useId();
  const points = series.points.slice(-period);
  const baselineYear = points.find((point) => point.population !== null && point.population > 0)?.year;
  const chartPoints = scale === "change" ? relativePopulationPoints(points, baselineYear) : points;
  const available = chartPoints.filter((point) => point.population !== null);
  const active = points.find((point) => point.year === hoverYear) ?? points[points.length - 1];
  const minYear = Number(points[0].year);
  const maxYear = Number(points[points.length - 1].year);
  const values = available.map((point) => point.population as number);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const padding = Math.max((maxValue - minValue) * 0.2, maxValue * 0.01, 1);
  const bottom = scale === "change" ? Math.floor(minValue - padding) : Math.max(0, Math.floor(minValue - padding));
  const top = Math.ceil(maxValue + padding);
  const x = (year: string) => maxYear === minYear ? 476 : 76 + ((Number(year) - minYear) / (maxYear - minYear)) * 800;
  const y = (population: number) => 264 - ((population - bottom) / (top - bottom)) * 240;
  function lineSegments(seriesPoints: typeof points) {
    const segments: string[][] = [];
    let segment: string[] = [];
    for (const point of seriesPoints) {
      if (point.population === null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else {
        segment.push(`${x(point.year)},${y(point.population)}`);
      }
    }
    if (segment.length) segments.push(segment);
    return segments;
  }

  const segments = lineSegments(chartPoints);
  const names = series.municipalityName;
  const formatValue = (value: number) => scale === "change" ? `${percentFormat.format(value)} %` : populationFormat.format(value);
  const activeValue = chartPoints.find((point) => point.year === active.year)?.population;
  const ticks = [...new Set([minYear, Math.round(minYear + (maxYear - minYear) / 2), maxYear])];

  function download() {
    const csv = populationCsv(series.municipalityName, points);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kuntakuva-${series.municipalityCode}-${points[0].year}-${points[points.length - 1].year}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="trend-section" aria-labelledby={titleId}>
      <div className="section-heading">
        <div><p className="eyebrow">AIKASARJA</p><h2 id={titleId}>Väestön kehitys</h2></div>
        <div className="chart-actions">
          <div className="segmented" role="group" aria-label="Esitystapa">
            <button type="button" aria-pressed={view === "chart"} title="Kaavio" aria-label="Kaavio" onClick={() => setView("chart")}><LineChart size={18} /></button>
            <button type="button" aria-pressed={view === "table"} title="Taulukko" aria-label="Taulukko" onClick={() => setView("table")}><Table2 size={18} /></button>
          </div>
          <button type="button" className="icon-button export-button" onClick={download} title="Lataa CSV" aria-label="Lataa näkyvä aikasarja CSV-tiedostona"><Download size={18} /></button>
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="chart-legends">
          <span className="chart-legend"><span />{series.municipalityName}</span>
        </div>
        <div className="segmented period-control" role="group" aria-label="Aikasarjan pituus">
          {[5, 10, 20].map((count) => <button key={count} type="button" aria-pressed={period === count}
            onClick={() => { setPeriod(count); setHoverYear(null); }}>{count} v</button>)}
        </div>
      </div>
      {view === "chart" ? (
        <>
          <div className="segmented scale-control" role="group" aria-label="Kaavion mittari">
            <button type="button" aria-pressed={scale === "population"} onClick={() => setScale("population")}>Asukasta</button>
            <button type="button" aria-pressed={scale === "change"} onClick={() => setScale("change")}>Muutos %</button>
          </div>
          <div className="chart-readout">
            <span>{active.year}</span>
            <strong>{activeValue === null || activeValue === undefined ? "Ei tietoa" : formatValue(activeValue)}</strong>
            <span>{series.municipalityName}</span>
          </div>
          {available.length ? (
            <div className="chart-frame">
              <svg viewBox="0 0 900 312" role="img" aria-label={`${names}: ${scale === "change" ? "väkiluvun muutos (%)" : "väkiluku"} vuosina ${minYear}–${maxYear}. Tarkat luvut taulukkonäkymässä.`}
                onMouseLeave={() => setHoverYear(null)} onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const pointer = ((event.clientX - rect.left) / rect.width) * 900;
                  const closest = points.reduce((best, point) => Math.abs(x(point.year) - pointer) < Math.abs(x(best.year) - pointer) ? point : best);
                  setHoverYear(closest.year);
                }}>
                <title>{`${names}, ${scale === "change" ? "väkiluvun muutos (%)" : "väkiluku"} ${minYear}–${maxYear}`}</title>
                {[0, 1, 2, 3, 4].map((tick) => {
                  const value = bottom + ((top - bottom) * tick) / 4;
                  const position = y(value);
                  return <g key={tick}><line x1="76" x2="876" y1={position} y2={position} className="chart-grid" />
                    <text x="62" y={position + 4} textAnchor="end" className="axis-label">{scale === "change" ? `${populationFormat.format(Math.round(value * 10) / 10)} %` : populationFormat.format(Math.round(value))}</text></g>;
                })}
                {segments.map((coordinates, index) => (
                  <g key={index}>
                    {scale === "population" && coordinates.length > 1 && <polygon points={`${coordinates[0].split(",")[0]},264 ${coordinates.join(" ")} ${coordinates[coordinates.length - 1].split(",")[0]},264`} className="chart-area" />}
                    <polyline points={coordinates.join(" ")} className="chart-line" />
                  </g>
                ))}
                {available.map((point) => <circle key={point.year} cx={x(point.year)} cy={y(point.population as number)}
                  r={active.year === point.year ? 5.5 : 3} className="chart-dot"><title>{`${series.municipalityName}, ${point.year}: ${formatValue(point.population as number)}`}</title></circle>)}
                {ticks.map((year) => <text key={year} x={x(String(year))} y="300" textAnchor="middle" className="axis-label">{year}</text>)}
              </svg>
            </div>
          ) : <p className="empty-chart">Tälle ajanjaksolle ei ole väkilukutietoja.</p>}
          <p className="chart-footnote">{scale === "change" ? `Väkiluvun muutos vuodesta ${baselineYear ?? "-"} (%)` : "Asukasta vuoden lopussa"} · {minYear}–{maxYear} · Y-akseli rajattu havaintoihin</p>
        </>
      ) : (
        <div className="table-wrap">
          <table><caption className="sr-only">{names}, väkiluku ja vuosimuutos</caption>
            <thead><tr><th scope="col">Vuosi</th><th scope="col">Asukasta</th><th scope="col">Vuosimuutos</th></tr></thead>
            <tbody>{[...points].reverse().map((point) => {
              const previous = series.points.find((item) => Number(item.year) === Number(point.year) - 1);
              const change = populationChange(point, previous);
              return <tr key={point.year}><th scope="row">{point.year}</th>
                <td>{point.population === null ? "Ei tietoa" : populationFormat.format(point.population)}</td>
                <td>{change ? signedPopulationFormat.format(change.absolute) : "Ei tietoa"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
