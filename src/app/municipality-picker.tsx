"use client";

import { ArrowRight, LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { Municipality } from "@/lib/statfin";

type MunicipalityPickerProps = {
  municipalities: Municipality[];
  years: string[];
  selectedCode: string;
  selectedYear: string;
};

export default function MunicipalityPicker({ municipalities, years, selectedCode, selectedYear }: MunicipalityPickerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [draftCode, setDraftCode] = useState(selectedCode);
  const [draftYear, setDraftYear] = useState(selectedYear);
  const [isPending, startTransition] = useTransition();
  const normalizedSearch = search.trim().toLocaleLowerCase("fi-FI");
  const filtered = municipalities.filter((municipality) =>
    municipality.name.toLocaleLowerCase("fi-FI").includes(normalizedSearch),
  );

  useEffect(() => {
    function restoreSelection() {
      setSearch("");
      setDraftCode(selectedCode);
      setDraftYear(selectedYear);
    }
    window.addEventListener("pageshow", restoreSelection);
    return () => window.removeEventListener("pageshow", restoreSelection);
  }, [selectedCode, selectedYear]);

  function updateSearch(value: string) {
    setSearch(value);
    if (!value.trim() && !draftCode) {
      setDraftCode(selectedCode);
      return;
    }
    if (!municipalities.some((item) => item.code === draftCode &&
        item.name.toLocaleLowerCase("fi-FI").includes(value.trim().toLocaleLowerCase("fi-FI")))) {
      setDraftCode("");
    }
  }

  function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!municipalities.some((item) => item.code === draftCode) || !years.includes(draftYear)) return;
    const params = new URLSearchParams({ kunta: draftCode, vuosi: draftYear });
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
    setSearch("");
  }

  return (
    <form action="/" method="get" onSubmit={navigate} className="picker" aria-busy={isPending}>
      <div className="field search-field">
        <label htmlFor="municipality-search">Hae kuntaa</label>
        <div className="input-wrap">
          <Search size={18} aria-hidden="true" />
          <input id="municipality-search" type="search" autoComplete="off" value={search}
            onChange={(event) => updateSearch(event.target.value)} disabled={isPending}
            aria-describedby="search-results" />
          {search && <button type="button" className="icon-button" onClick={() => updateSearch("")}
            aria-label="Tyhjennä haku" title="Tyhjennä haku" disabled={isPending}><X size={16} /></button>}
        </div>
        <span id="search-results" className="field-note" role="status">
          {search ? `${filtered.length} hakutulosta` : `${municipalities.length} kuntaa`}
        </span>
      </div>
      <div className="field">
        <label htmlFor="municipality">Kunta</label>
        <select id="municipality" name="kunta" required value={draftCode}
          onChange={(event) => setDraftCode(event.target.value)} disabled={isPending}>
          <option value="" disabled>{filtered.length ? "Valitse kunta" : "Ei hakutuloksia"}</option>
          {filtered.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </div>
      <div className="field year-field">
        <label htmlFor="year">Vuosi</label>
        <select id="year" name="vuosi" value={draftYear} onChange={(event) => setDraftYear(event.target.value)} disabled={isPending}>
          {[...years].reverse().map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
      <button type="submit" className="button button-primary picker-submit" disabled={isPending || !draftCode}>
        {isPending ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
        {isPending ? "Haetaan" : "Näytä"}
      </button>
      <span className="sr-only" role="status">{isPending ? "Haetaan kunnan tietoja." : ""}</span>
    </form>
  );
}
