import { getMunicipalityPopulation } from "@/lib/statfin";

export default async function Home() {
  const municipality = await getMunicipalityPopulation("KU091", "2025");
  const formattedPopulation = new Intl.NumberFormat("fi-FI").format(
    municipality.population,
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <p className="text-lg font-semibold">Kuntakuva</p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-sm font-medium text-slate-500">Kunta</p>
        <h1 className="mt-2 text-4xl font-semibold">
          {municipality.municipalityName}
        </h1>

        <div className="mt-10 max-w-sm border border-slate-200 bg-white p-6">
          <p className="text-sm font-medium text-slate-500">
            Väkiluku 31.12.{municipality.year}
          </p>
          <p className="mt-3 text-4xl font-semibold">{formattedPopulation}</p>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Lähde: {municipality.source}
        </p>
      </section>
    </main>
  );
}
