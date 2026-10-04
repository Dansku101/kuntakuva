"use client";

import { useEffect, useRef, useState } from "react";
import type { Municipality } from "@/lib/statfin";

type MunicipalityPickerProps = {
  municipalities: Municipality[];
  selectedCode: string;
};

export default function MunicipalityPicker({
  municipalities,
  selectedCode,
}: MunicipalityPickerProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("fi-FI");
  const filteredMunicipalities = municipalities.filter((municipality) =>
    municipality.name
      .toLocaleLowerCase("fi-FI")
      .includes(normalizedSearch),
  );

  useEffect(() => {
    function resetSelection() {
      if (selectRef.current) {
        selectRef.current.value = selectedCode;
      }
    }

    function handlePageShow() {
      setSearch("");
      resetSelection();
    }

    resetSelection();
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [selectedCode]);

  return (
    <form action="/" method="get" className="mb-8 flex flex-wrap items-end gap-3">
      <div>
        <label
          htmlFor="municipality-search"
          className="mb-2 block text-sm font-medium"
        >
          Hae kuntaa
        </label>
        <input
          id="municipality-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2"
        />
      </div>
      <div>
        <label
          htmlFor="municipality"
          className="mb-2 block text-sm font-medium"
        >
          Valitse kunta
        </label>
        <select
          key={normalizedSearch}
          ref={selectRef}
          id="municipality"
          name="kunta"
          required
          defaultValue={
            filteredMunicipalities.some(
              (municipality) => municipality.code === selectedCode,
            )
              ? selectedCode
              : ""
          }
          className="max-w-full rounded border border-slate-300 bg-white px-3 py-2"
        >
          <option value="" disabled>
            {filteredMunicipalities.length === 0
              ? "Ei hakutuloksia"
              : "Valitse kunta"}
          </option>
          {filteredMunicipalities.map((municipality) => (
            <option key={municipality.code} value={municipality.code}>
              {municipality.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded bg-slate-900 px-4 py-2 text-white"
      >
        Näytä
      </button>
    </form>
  );
}
