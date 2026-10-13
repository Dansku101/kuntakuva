"use client";

import { ArrowRight, LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import type { Municipality } from "@/lib/statfin";
import { matchesMunicipalityName, searchMunicipalities } from "@/lib/municipality-search";

type MunicipalityPickerProps = {
  municipalities: Municipality[];
  years: string[];
  selectedCode: string;
  selectedYear: string;
  view?: "yleiskuva" | "trendit" | "kartta" | "tilastot" | "vertailu";
  compareCode?: string;
  primaryCode?: string;
};

export default function MunicipalityPicker({ municipalities, years, selectedCode, selectedYear, view, compareCode, primaryCode }: MunicipalityPickerProps) {
  const id = useId();
  const router = useRouter();
  const selectedName = municipalities.find((item) => item.code === selectedCode)?.name ?? "";
  const [search, setSearch] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [draftCode, setDraftCode] = useState(selectedCode);
  const [draftYear, setDraftYear] = useState(selectedYear);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = searchMunicipalities(municipalities, search).slice(0, 8);

  useEffect(() => {
    if (open && filtered[active]) document.getElementById(`${id}-option-${filtered[active].code}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, filtered, id]);

  useEffect(() => {
    function restoreSelection() {
      setSearch(selectedName);
      setOpen(false);
      setDraftCode(selectedCode);
      setDraftYear(selectedYear);
    }
    window.addEventListener("pageshow", restoreSelection);
    return () => window.removeEventListener("pageshow", restoreSelection);
  }, [selectedCode, selectedYear, selectedName]);

  function updateSearch(value: string) {
    setSearch(value);
    setOpen(true);
    setActive(0);
    setDraftCode(municipalities.find((item) => matchesMunicipalityName(item, value))?.code ?? "");
  }

  function selectMunicipality(item: Municipality) {
    setSearch(item.name);
    setDraftCode(item.code);
    setOpen(false);
  }

  function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!municipalities.some((item) => item.code === draftCode) || !years.includes(draftYear)) return;
    const params = new URLSearchParams({ kunta: primaryCode ?? draftCode, vuosi: draftYear });
    if (primaryCode) params.set("vertaa", draftCode);
    else if (compareCode && compareCode !== draftCode) params.set("vertaa", compareCode);
    if (view) params.set("nakyma", view);
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
    setOpen(false);
  }

  return (
    <form action="/" method="get" onSubmit={navigate} className={`picker${primaryCode ? " comparison-picker" : ""}`} aria-busy={isPending}>
      <div className="field search-field" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <label htmlFor={`${id}-search`}>{primaryCode ? "Vertailukunta" : "Hae kuntaa"}</label>
        <div className="input-wrap">
          <Search size={18} aria-hidden="true" />
          <input ref={inputRef} id={`${id}-search`} type="search" maxLength={80} autoComplete="off" value={search}
            onChange={(event) => updateSearch(event.target.value)} disabled={isPending}
            onFocus={(event) => { setOpen(true); event.target.select(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive((current) => !open ? 0 : Math.max(0, Math.min(filtered.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
              }
              if (event.key === "Enter" && open && filtered[active]) {
                event.preventDefault();
                selectMunicipality(filtered[active]);
              }
            }}
            role="combobox" aria-autocomplete="list" aria-expanded={open}
            aria-controls={open ? `${id}-options` : undefined}
            aria-activedescendant={open && filtered[active] ? `${id}-option-${filtered[active].code}` : undefined}
            aria-describedby={`${id}-results`} />
          {search && <button type="button" className="icon-button" onClick={() => { inputRef.current?.focus(); updateSearch(""); }}
            aria-label="Tyhjennä haku" title="Tyhjennä haku" disabled={isPending}><X size={16} /></button>}
        </div>
        {open && <ul id={`${id}-options`} role="listbox" className="municipality-options" aria-label={primaryCode ? "Vertailukunnat" : "Kunnat"}>
          {filtered.map((item, index) => <li key={item.code} id={`${id}-option-${item.code}`}
            role="option" aria-selected={index === active} onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)} onClick={() => selectMunicipality(item)}>
            <span>{item.name}{item.aliases?.length ? <small className="municipality-alias">{item.aliases.join(" · ")}</small> : null}</span><small>{item.code.slice(2)}</small>
          </li>)}
          {!filtered.length && <li className="no-results" role="presentation">Ei hakutuloksia</li>}
        </ul>}
        <span id={`${id}-results`} className="field-note" role="status">
          {open ? `${filtered.length} ehdotusta` : `${municipalities.length} kuntaa`}
        </span>
      </div>
      <input type="hidden" name="kunta" value={primaryCode ?? draftCode} />
      {(primaryCode || compareCode !== draftCode && compareCode) && <input type="hidden" name="vertaa" value={primaryCode ? draftCode : compareCode} />}
      {view && <input type="hidden" name="nakyma" value={view} />}
      {primaryCode ? <input type="hidden" name="vuosi" value={draftYear} /> : <div className="field year-field">
        <label htmlFor={`${id}-year`}>Vuosi</label>
        <select id={`${id}-year`} name="vuosi" value={draftYear} onChange={(event) => setDraftYear(event.target.value)} disabled={isPending}>
          {[...years].reverse().map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>}
      <button type="submit" className="button button-primary picker-submit" disabled={isPending || !draftCode}>
        {isPending ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
        {isPending ? "Haetaan" : primaryCode ? "Vertaa" : "Näytä"}
      </button>
      <span className="sr-only" role="status">{isPending ? "Haetaan kunnan tietoja." : ""}</span>
    </form>
  );
}
